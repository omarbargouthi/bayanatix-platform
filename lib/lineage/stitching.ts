// FR-11 — cross-system stitching. Resolves an external reference made by one
// connector (an SSIS connection manager, a Power BI M-expression's source call)
// to a catalog asset harvested by another connector — or, if nothing matches,
// creates a placeholder asset and queues it for steward review. Never guesses
// silently: every non-exact match is either logged with a confidence downgrade
// or routed through the review queue.
import { sql } from "../db";
import { ensureDataSource, ensureSchema, ensureEntity } from "./catalog-upsert";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type ExternalRef = {
  engine: string;              // ORACLE | MSSQL | POSTGRES | POWERBI | FABRIC
  host: string | null;
  database: string | null;     // database name or Oracle service name/SID
  schema: string | null;
  object: string;              // table / entity name
  column?: string | null;
};

export type ExternalIdRef = { systemCode: string; externalIdText: string };

export type StitchResult =
  | { status: "RESOLVED"; entityId: number; attributeId: number | null; confidence: Confidence }
  | { status: "QUEUED"; placeholderEntityId: number; stitchId: number };

// ── Normalization (FR-11.1) ──────────────────────────────────────────────────

function normEngineIdent(engine: string, s: string): string {
  const trimmed = s.trim();
  if (engine === "ORACLE") return trimmed.replace(/^"(.*)"$/, "$1") === trimmed ? trimmed.toUpperCase() : trimmed.replace(/^"(.*)"$/, "$1");
  if (engine === "POSTGRES") return trimmed.replace(/^"(.*)"$/, "$1") === trimmed ? trimmed.toLowerCase() : trimmed.replace(/^"(.*)"$/, "$1");
  return trimmed; // MSSQL / POWERBI / FABRIC: case-insensitive compare, keep as-is
}

// Short-name vs FQDN tolerated ("sqlfin01" matches "sqlfin01.corp.local"); IP vs
// hostname is NOT auto-matched; a named instance ("host\INSTANCE") compares on
// the full string (no short-name stripping once a backslash is present).
function hostsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  const la = a.toLowerCase(), lb = b.toLowerCase();
  if (la === lb) return true;
  if (la.includes("\\") || lb.includes("\\")) return false;
  const shortA = la.split(".")[0], shortB = lb.split(".")[0];
  const isIp = (h: string) => /^\d+\.\d+\.\d+\.\d+$/.test(h);
  if (isIp(la) || isIp(lb)) return false;
  return shortA === shortB;
}

export function normalizeRef(ref: ExternalRef): ExternalRef {
  return {
    engine: ref.engine.toUpperCase(),
    host: ref.host,
    database: ref.database ? normEngineIdent(ref.engine.toUpperCase(), ref.database) : null,
    schema: ref.schema ? normEngineIdent(ref.engine.toUpperCase(), ref.schema) : null,
    object: normEngineIdent(ref.engine.toUpperCase(), ref.object),
    column: ref.column ? normEngineIdent(ref.engine.toUpperCase(), ref.column) : null,
  };
}

// ── Candidate lookup against the catalog (data_sources is the real catalog;
// connection_registry is consulted only for aliasing and for the edge's
// connection_id FK — most data_sources rows aren't linked back to it) ───────

async function findDataSourceCandidates(engine: string, host: string | null, database: string | null): Promise<{ id: number; hostAddressText: string | null; databaseNameText: string | null; connectionId: number | null }[]> {
  return sql<{ id: number; hostAddressText: string | null; databaseNameText: string | null; connectionId: number | null }[]>`
    SELECT data_source_id AS id, host_address_text AS "hostAddressText", database_name_text AS "databaseNameText", connection_id AS "connectionId"
    FROM bayanat.data_sources
    WHERE source_type_code = ${engine}
      AND (${database}::text IS NULL OR lower(database_name_text) = lower(${database}))
  `;
}

async function resolveViaCandidate(dataSourceId: number, ref: ExternalRef): Promise<{ entityId: number; attributeId: number | null } | null> {
  const schemaRows = ref.schema
    ? await sql<{ id: number }[]>`SELECT schema_id AS id FROM bayanat.data_schemas WHERE data_source_id = ${dataSourceId} AND lower(schema_name_text) = lower(${ref.schema})`
    : await sql<{ id: number }[]>`SELECT schema_id AS id FROM bayanat.data_schemas WHERE data_source_id = ${dataSourceId}`;
  for (const s of schemaRows) {
    const [entity] = await sql<{ id: number }[]>`
      SELECT entity_id AS id FROM bayanat.data_entities WHERE schema_id = ${s.id} AND lower(entity_name_text) = lower(${ref.object})
    `;
    if (!entity) continue;
    let attributeId: number | null = null;
    if (ref.column) {
      const [attr] = await sql<{ id: number }[]>`
        SELECT attribute_id AS id FROM bayanat.data_attributes WHERE entity_id = ${entity.id} AND lower(physical_name_text) = lower(${ref.column})
      `;
      attributeId = attr?.id ?? null; // missing column on a stitched entity => stay at entity level (FR-11.3)
    }
    return { entityId: entity.id, attributeId };
  }
  return null;
}

// ── File references (CSV / Excel / JSON) ─────────────────────────────────────
// A report reads a file by its full path; the crawler catalogs the same file as an
// entity named after the file (without extension) inside the folder it was crawled
// from. So a file reference is matched on the file name — HIGH when the crawled
// source is that very file or its folder, MEDIUM when a file of that name was crawled
// from a different folder (a copy / a moved export) and it is the only one.
const FILE_ENGINES = ["CSV", "EXCEL", "JSON"];

function normPath(p: string | null): string {
  return (p ?? "").trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

async function resolveFileRef(ref: ExternalRef): Promise<{ entityId: number; attributeId: number | null; confidence: Confidence } | null> {
  const filePath = normPath(ref.host);
  const fileName = (filePath.split("/").pop() || ref.object).trim();
  const baseName = fileName.replace(/\.[a-z0-9]+$/i, "");
  // Crawled sources only (connection_id set) — never another unresolved placeholder.
  const candidates = await sql<{ entityId: number; hostAddressText: string | null }[]>`
    SELECT e.entity_id AS "entityId", ds.host_address_text AS "hostAddressText"
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE ds.source_type_code = ${ref.engine} AND ds.connection_id IS NOT NULL
      AND lower(e.entity_name_text) IN (lower(${baseName}), lower(${fileName}))
    ORDER BY e.entity_id
  `;
  if (candidates.length === 0) return null;
  const fileDir = filePath.split("/").slice(0, -1).join("/");
  const samePlace = candidates.filter((c) => { const h = normPath(c.hostAddressText); return h === filePath || h === fileDir; });
  const pick = samePlace.length === 1 ? { entityId: samePlace[0].entityId, confidence: "HIGH" as Confidence }
    : samePlace.length === 0 && candidates.length === 1 ? { entityId: candidates[0].entityId, confidence: "MEDIUM" as Confidence }
    : null;
  if (!pick) return null; // several files of that name — a steward decides (Stitching Review)
  let attributeId: number | null = null;
  if (ref.column) {
    const [attr] = await sql<{ id: number }[]>`
      SELECT attribute_id AS id FROM bayanat.data_attributes WHERE entity_id = ${pick.entityId} AND lower(physical_name_text) = lower(${ref.column})
    `;
    attributeId = attr?.id ?? null;
  }
  return { ...pick, attributeId };
}

/** Removes placeholder entities the scanner created for references that have since been
 *  matched to a real asset: nothing points at them any more, so they'd only clutter the
 *  catalog and the Stitching Review queue. Placeholders still used by an edge are kept. */
export async function pruneOrphanPlaceholders(): Promise<number> {
  const orphans = await sql<{ entityId: number; schemaId: number }[]>`
    SELECT e.entity_id AS "entityId", e.schema_id AS "schemaId"
    FROM bayanat.data_entities e
    WHERE e.entity_id IN (SELECT placeholder_entity_id FROM bayanat.lineage_stitch_queue WHERE status_code = 'OPEN')
      AND e.description_text LIKE 'Auto-created by the lineage scanner%'
      AND NOT EXISTS (SELECT 1 FROM bayanat.data_attributes a WHERE a.entity_id = e.entity_id)
      AND NOT EXISTS (
        SELECT 1 FROM bayanat.data_lineage l
        WHERE l.lineage_scope_code = 'ENTITY_LEVEL' AND (l.source_asset_id = e.entity_id OR l.target_asset_id = e.entity_id)
      )
  `;
  for (const o of orphans) {
    try {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM bayanat.lineage_stitch_queue WHERE placeholder_entity_id = ${o.entityId}`;
        await tx`DELETE FROM bayanat.data_entities WHERE entity_id = ${o.entityId}`;
        await tx`
          DELETE FROM bayanat.data_schemas s WHERE s.schema_id = ${o.schemaId}
            AND NOT EXISTS (SELECT 1 FROM bayanat.data_entities e WHERE e.schema_id = s.schema_id)
        `;
        await tx`
          DELETE FROM bayanat.data_sources ds
          WHERE ds.connection_id IS NULL AND ds.description_text LIKE 'Auto-created%'
            AND NOT EXISTS (SELECT 1 FROM bayanat.data_schemas s WHERE s.data_source_id = ds.data_source_id)
        `;
      });
    } catch { /* something else still references it — leave it for the review queue */ }
  }
  return orphans.length;
}

async function findAlias(engine: string, host: string | null, database: string | null): Promise<{ connectionId: number; hostAddress: string; databaseName: string | null } | null> {
  const fingerprint = `${engine}|${host ?? ""}|${database ?? ""}`.toLowerCase();
  const [alias] = await sql<{ connectionId: number }[]>`
    SELECT connection_id AS "connectionId" FROM bayanat.lineage_connection_aliases
    WHERE engine_code = ${engine} AND alias_fingerprint_text = ${fingerprint}
  `;
  if (!alias) return null;
  const [conn] = await sql<{ hostAddress: string; databaseName: string | null }[]>`
    SELECT host_address AS "hostAddress", database_name AS "databaseName" FROM bayanat.connection_registry WHERE connection_id = ${alias.connectionId}
  `;
  return conn ? { connectionId: alias.connectionId, hostAddress: conn.hostAddress, databaseName: conn.databaseName } : null;
}

async function enqueueStitch(ref: ExternalRef, scanRunId: number | null): Promise<{ placeholderEntityId: number; stitchId: number }> {
  // data_sources.source_name_text is varchar(100) — a CSV/file "host" (a full
  // path, unlike a short DB hostname) can easily overflow it. Full fidelity
  // stays in the entity's description text below, which is unbounded.
  const rawSourceName = `${ref.engine} — ${ref.host ?? "unknown host"}${ref.database ? `/${ref.database}` : ""}`;
  const placeholderSourceName = rawSourceName.length > 100 ? `${rawSourceName.slice(0, 97)}...` : rawSourceName;
  const dataSourceId = await ensureDataSource(placeholderSourceName, ref.engine, ref.host, ref.database, { placeholder: true });
  const schemaId = await ensureSchema(dataSourceId, ref.schema ?? "(unknown)");
  // Only a reference was seen — the real object type is known once its source is crawled.
  const placeholderEntityId = await ensureEntity(schemaId, ref.object, "UNKNOWN", {
    placeholder: true,
    description: `Auto-created by the lineage scanner — reference "${ref.engine}:${ref.host ?? "?"}/${ref.database ?? "?"}/${ref.schema ?? "?"}/${ref.object}" did not match any registered connection. Bind it from the Stitching Review page.`,
  });

  const candidates = await sql<{ connectionId: number; connectionName: string }[]>`
    SELECT connection_id AS "connectionId", connection_name AS "connectionName"
    FROM bayanat.connection_registry WHERE db_type_code = ${ref.engine} LIMIT 5
  `;

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.lineage_stitch_queue (scan_run_id, external_ref, placeholder_entity_id, candidate_connections)
    VALUES (${scanRunId}, ${sql.json(ref)}, ${placeholderEntityId}, ${sql.json(candidates)})
    RETURNING stitch_id AS id
  `;
  return { placeholderEntityId, stitchId: row.id };
}

/**
 * Resolution order (FR-11.2), first hit wins:
 *  1. asset_external_ids exact GUID match (externalId param — Power BI/Fabric only)
 *  2. exact tuple match against a cataloged data_sources row (engine+host+database)
 *  3. tuple match ignoring host, exactly one candidate => confidence downgraded one level
 *  4. lineage_connection_aliases fingerprint match => retry with the alias's canonical host/database, original confidence
 *  5. no match => placeholder asset + lineage_stitch_queue row
 */
export async function resolveStitch(rawRef: ExternalRef, scanRunId: number | null, externalId?: ExternalIdRef): Promise<StitchResult> {
  if (externalId) {
    const [hit] = await sql<{ assetTypeCode: string; assetId: number }[]>`
      SELECT asset_type_code AS "assetTypeCode", asset_id AS "assetId" FROM bayanat.asset_external_ids
      WHERE system_code = ${externalId.systemCode} AND external_id_text = ${externalId.externalIdText}
    `;
    if (hit) {
      if (hit.assetTypeCode === "DATA_ATTRIBUTES") return { status: "RESOLVED", entityId: -1, attributeId: hit.assetId, confidence: "HIGH" };
      return { status: "RESOLVED", entityId: hit.assetId, attributeId: null, confidence: "HIGH" };
    }
  }

  const ref = normalizeRef(rawRef);

  // Files are matched on the file itself (see resolveFileRef), not host+database.
  if (FILE_ENGINES.includes(ref.engine)) {
    const hit = await resolveFileRef(ref);
    if (hit) return { status: "RESOLVED", entityId: hit.entityId, attributeId: hit.attributeId, confidence: hit.confidence };
    const queued = await enqueueStitch(ref, scanRunId);
    return { status: "QUEUED", placeholderEntityId: queued.placeholderEntityId, stitchId: queued.stitchId };
  }

  // Step 2: exact host+database match.
  const exactCandidates = (await findDataSourceCandidates(ref.engine, ref.host, ref.database)).filter((c) => hostsMatch(c.hostAddressText, ref.host));
  for (const c of exactCandidates) {
    const hit = await resolveViaCandidate(c.id, ref);
    if (hit) return { status: "RESOLVED", entityId: hit.entityId, attributeId: hit.attributeId, confidence: "HIGH" };
  }

  // Step 3: ignore host, require exactly one candidate database-wide.
  const looseCandidates = await findDataSourceCandidates(ref.engine, null, ref.database);
  if (looseCandidates.length === 1) {
    const hit = await resolveViaCandidate(looseCandidates[0].id, ref);
    if (hit) return { status: "RESOLVED", entityId: hit.entityId, attributeId: hit.attributeId, confidence: "MEDIUM" };
  }

  // Step 4: connection alias.
  const alias = await findAlias(ref.engine, ref.host, ref.database);
  if (alias) {
    const aliasCandidates = (await findDataSourceCandidates(ref.engine, alias.hostAddress, alias.databaseName)).filter((c) => hostsMatch(c.hostAddressText, alias.hostAddress));
    for (const c of aliasCandidates) {
      const hit = await resolveViaCandidate(c.id, ref);
      if (hit) return { status: "RESOLVED", entityId: hit.entityId, attributeId: hit.attributeId, confidence: "HIGH" };
    }
  }

  // Step 5: placeholder + review queue.
  const queued = await enqueueStitch(ref, scanRunId);
  return { status: "QUEUED", placeholderEntityId: queued.placeholderEntityId, stitchId: queued.stitchId };
}
