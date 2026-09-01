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
  const placeholderEntityId = await ensureEntity(schemaId, ref.object, false, {
    layerCodeOverride: "SOURCE",
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
