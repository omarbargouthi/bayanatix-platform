// Azure Data Factory / Azure Synapse crawler — step 3: match to the catalog and store.
//
// Crawls a db_type_code 'ADF' or 'SYNAPSE' connection: loads the definitions
// (definitions.ts), reads them (model.ts), and records
//   * a lineage process per pipeline, Copy activity, mapping data flow and notebook;
//   * a table-level link for every source → sink they describe, and column-level links
//     where the definition states the columns.
// The tables and files they name are matched to what is already in the catalog through
// the same stitching as SSIS and Power BI (lib/lineage/stitching.ts): anything not found
// becomes a placeholder asset queued for Stitching Review — never a silent guess.
//
// Uses the crawl_jobs / connection_registry status plumbing of lib/crawler.ts, so the
// crawl shows in the same history and log as every other source.
import { createHash } from "node:crypto";
import { sql } from "../../db";
import { getConnection, getConnectionPassword, updateCrawlStatus } from "../../queries/sources";
import { createCrawlJob, addCrawlJobLog, finishCrawlJob, failCrawlJob } from "../../queries/crawl-jobs";
import { ensureAttribute } from "../catalog-upsert";
import { resolveStitch, pruneOrphanPlaceholders, type Confidence, type ExternalRef } from "../stitching";
import { ensureProcess } from "../powerbi-ingester";
import { extractSourceTable } from "../ssis-parser";
import { schedulePropagation } from "../propagation";
import { loadDefinitions, countDefinitions, isLiveAddress, type AzureConnection } from "./definitions";
import { buildCatalog, parsePipeline, parseDataFlow, parseNotebook, type ObjectRef, type Resolved, type ColumnPair } from "./model";

export type AzureScanResult = { processes: number; tablesLinked: number; tableLinks: number; columnLinks: number; warnings: string[] };

const RANK: Record<Confidence, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };
const worse = (a: Confidence, b: Confidence): Confidence => (RANK[a] <= RANK[b] ? a : b);
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

type Target = { entityId: number; confidence: Confidence; placeholder: boolean; label: string };

async function toAzureConnection(connectionId: number): Promise<AzureConnection & { connectionId: number }> {
  const conn = await getConnection(connectionId);
  if (!conn) throw new Error("Connection not found");
  if (conn.dbTypeCode !== "ADF" && conn.dbTypeCode !== "SYNAPSE") throw new Error("connectionId must reference an Azure Data Factory or Azure Synapse connection");
  return {
    connectionId, dbTypeCode: conn.dbTypeCode, connectionName: conn.connectionName, hostAddress: conn.hostAddress,
    tenantId: conn.databaseName, clientId: conn.usernameText, clientSecret: await getConnectionPassword(connectionId),
  };
}

/** "Test connection": the definitions can be read, and how many there are. */
export async function testAzureConnection(connectionId: number): Promise<{ ok: boolean; message: string }> {
  const conn = await toAzureConnection(connectionId);
  const { defs, problems } = await loadDefinitions(conn);
  const total = defs.pipelines.length + defs.dataflows.length + defs.notebooks.length;
  const where = isLiveAddress(conn.dbTypeCode, conn.hostAddress) ? "the live service" : "the folder";
  if (total === 0) return { ok: false, message: `Nothing to crawl: no pipelines, data flows or notebooks were found in ${where}.` };
  return { ok: true, message: `Read from ${where}: ${countDefinitions(defs)}${problems.length ? ` (${problems.length} file(s) skipped)` : ""}` };
}

export async function scanAzureConnection(connectionId: number, triggeredByUserId: string | null): Promise<AzureScanResult> {
  const conn = await toAzureConnection(connectionId);
  const prefix = conn.dbTypeCode; // process types: ADF_PIPELINE, SYNAPSE_NOTEBOOK, …
  const jobId = await createCrawlJob(connectionId, conn.connectionName);
  const warnings: string[] = [];
  const info = (m: string) => addCrawlJobLog(jobId, "INFO", m);
  const warn = async (m: string) => { warnings.push(m); await addCrawlJobLog(jobId, "WARN", m); };

  const [run] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.lineage_scan_runs (connection_id, status_code, triggered_by_user_id)
    VALUES (${connectionId}, 'RUNNING', ${triggeredByUserId})
    RETURNING scan_run_id AS id
  `;
  const scanRunId = run.id;

  try {
    await info(`Reading ${prefix === "ADF" ? "Azure Data Factory" : "Azure Synapse"} definitions from ${isLiveAddress(prefix, conn.hostAddress) ? "the live service" : "folder"} "${conn.hostAddress}"`);
    const { defs, problems } = await loadDefinitions(conn);
    for (const p of problems) await warn(p);
    await info(`Found ${countDefinitions(defs)}`);

    const catalog = buildCatalog(defs.linkedServices, defs.datasets);
    const seenProcesses = new Set<number>();
    const linkedEntities = new Set<number>();
    let tableLinks = 0, columnLinks = 0;

    // ── catalog matching ──
    const targets = new Map<string, Target>();
    const resolve = async (o: ObjectRef): Promise<Target> => {
      const key = JSON.stringify(o.ref).toLowerCase();
      const hit = targets.get(key);
      if (hit) return hit;
      const stitch = await resolveStitch(o.ref as ExternalRef, scanRunId);
      const entityId = stitch.status === "RESOLVED" ? stitch.entityId : stitch.placeholderEntityId;
      const [row] = await sql<{ placeholder: boolean; objectType: string }[]>`
        SELECT coalesce(description_text LIKE 'Auto-created%', false) AS placeholder, object_type_code AS "objectType"
        FROM bayanat.data_entities WHERE entity_id = ${entityId}
      `;
      const placeholder = stitch.status !== "RESOLVED" || !!row?.placeholder;
      // A file dataset is a file by definition; a placeholder otherwise starts as "unknown".
      if (placeholder && o.isFile && row?.objectType === "UNKNOWN") {
        await sql`UPDATE bayanat.data_entities SET object_type_code = 'FILE' WHERE entity_id = ${entityId}`;
      }
      const t: Target = { entityId, placeholder, label: o.label, confidence: placeholder ? "LOW" : stitch.status === "RESOLVED" ? stitch.confidence : "LOW" };
      targets.set(key, t);
      return t;
    };
    // A column of a real catalog table is linked only when the table has it; a
    // placeholder has no columns of its own yet, so the definition's are recorded on it.
    const attribute = async (t: Target, column: string): Promise<number | null> => {
      const [a] = await sql<{ id: number }[]>`
        SELECT attribute_id AS id FROM bayanat.data_attributes WHERE entity_id = ${t.entityId} AND lower(physical_name_text) = lower(${column})
      `;
      if (a) return a.id;
      return t.placeholder ? ensureAttribute(t.entityId, column, null) : null;
    };
    const columnNames = async (t: Target): Promise<string[]> =>
      (await sql<{ name: string }[]>`SELECT physical_name_text AS name FROM bayanat.data_attributes WHERE entity_id = ${t.entityId}`).map((r) => r.name);

    const edge = async (scope: "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL", sourceId: number, targetId: number, type: string, logic: string, processId: number, confidence: Confidence) => {
      if (sourceId === targetId) return;
      await sql`
        INSERT INTO bayanat.data_lineage
          (lineage_scope_code, asset_type_code, source_asset_id, target_asset_id,
           transformation_type_code, transformation_logic_text, process_id, provenance_code, confidence_code, connection_id, updated_by_user_id)
        VALUES (
          ${scope}, ${scope === "ENTITY_LEVEL" ? "DATA_ENTITIES" : "DATA_ATTRIBUTES"}, ${sourceId}, ${targetId},
          ${type}, ${logic}, ${processId}, 'SCANNED', ${confidence}, ${connectionId}, 'azure_scanner'
        )
        ON CONFLICT (lineage_scope_code, source_asset_id, target_asset_id, COALESCE(process_id, -1))
        DO UPDATE SET transformation_type_code = EXCLUDED.transformation_type_code, transformation_logic_text = EXCLUDED.transformation_logic_text,
          confidence_code = EXCLUDED.confidence_code, last_updated_timestamp = now()
      `;
      if (scope === "ENTITY_LEVEL") { tableLinks++; linkedEntities.add(sourceId); linkedEntities.add(targetId); } else columnLinks++;
    };

    const process = async (kind: string, name: string, definition: string, description: string | null, parentId: number | null = null): Promise<number> => {
      const { id } = await ensureProcess(connectionId, `${prefix}_${kind}`, cut(name, 200), cut(`${conn.connectionName} / ${kind.toLowerCase()} / ${name}`, 400), definition);
      await sql`
        UPDATE bayanat.lineage_processes
        SET parent_process_id = ${parentId}, description_text = ${description},
            definition_hash = ${createHash("sha256").update(definition).digest("hex")}
        WHERE process_id = ${id}
      `;
      seenProcesses.add(id);
      return id;
    };

    /** Column links for the pairs given; returns how many pairs had no such column on a real table. */
    const linkColumns = async (pairs: ColumnPair[], src: Target, dst: Target, type: string, logic: (p: ColumnPair) => string, processId: number, confidence: Confidence): Promise<number> => {
      let missing = 0;
      for (const p of pairs) {
        const s = await attribute(src, p.source), d = await attribute(dst, p.sink);
        if (s === null || d === null) { missing++; continue; }
        await edge("ATTRIBUTE_LEVEL", s, d, type, logic(p), processId, confidence);
      }
      return missing;
    };

    // ── pipelines and their Copy activities ──
    for (const p of defs.pipelines) {
      const m = parsePipeline(p, catalog);
      const runs = [
        ...m.dataFlows.map((d) => `runs data flow "${d}"`), ...m.notebooks.map((n) => `runs notebook "${n}"`),
        ...m.childPipelines.map((c) => `runs pipeline "${c}"`), ...m.copies.map((c) => `copy "${c.path}"`),
      ];
      const pipelineId = await process("PIPELINE", m.name, runs.join("\n") || "(no data-moving activities)", typeof p.properties?.description === "string" ? p.properties.description : null);
      const untraced = Object.entries(m.untraced);
      if (untraced.length > 0) {
        await warn(`Pipeline "${m.name}": ${untraced.map(([t, n]) => `${n} ${t}`).join(", ")} activity(ies) move data in ways the definition does not describe — not traced`);
      }

      for (const c of m.copies) {
        if (!c.source.ok || !c.sink.ok) {
          const reasons = [c.source, c.sink].filter((r): r is Extract<Resolved, { ok: false }> => !r.ok).map((r) => r.reason);
          await warn(`Pipeline "${m.name}", copy "${c.path}" not traced: ${reasons.join("; ")}`);
          continue;
        }
        // A source query reads the table it names, which need not be the dataset's.
        let sourceObject = c.source.object, queryNote = "";
        if (c.query && !sourceObject.isFile) {
          const t = extractSourceTable(c.query, sourceObject.ref.engine);
          if (t) {
            sourceObject = { ...sourceObject, ref: { ...sourceObject.ref, schema: t.schema ?? sourceObject.ref.schema, object: t.table }, label: `${sourceObject.ref.engine}: ${[sourceObject.ref.database, t.schema ?? sourceObject.ref.schema, t.table].filter(Boolean).join(".")}` };
          }
          queryNote = ` — source query: ${cut(c.query.replace(/\s+/g, " ").trim(), 600)}`;
        }
        const src = await resolve(sourceObject), dst = await resolve(c.sink.object);
        let confidence = worse(src.confidence, dst.confidence);
        if (c.query) confidence = worse(confidence, "MEDIUM");   // the query may read more than its first table
        if (c.dynamicQuery) { confidence = "LOW"; queryNote = " — the source query is built at run time; the dataset's table is assumed"; }

        const definition = [`Source: ${src.label}`, `Sink: ${dst.label}`, c.query ? `Query: ${c.query}` : null,
          c.mapping ? `Mapping: ${c.mapping.map((x) => `${x.source} → ${x.sink}`).join(", ")}` : "Mapping: default (same-named columns)"].filter(Boolean).join("\n");
        const copyId = await process("COPY", `${m.name} :: ${c.path}`, definition, null, pipelineId);
        await edge("ENTITY_LEVEL", src.entityId, dst.entityId, "DIRECT", cut(`Copy activity "${c.path}" in pipeline "${m.name}"${queryNote}`, 2000), copyId, confidence);

        if (c.mapping) {
          const missing = await linkColumns(c.mapping, src, dst, "DIRECT", (x) => `Copy activity mapping: ${x.source} → ${x.sink}`, copyId, confidence);
          if (missing > 0) await warn(`Pipeline "${m.name}", copy "${c.path}": ${missing} mapped column(s) are not columns of the catalog table — linked at table level only`);
        } else if (!c.query && !c.dynamicQuery) {
          // No mapping stated: the Copy activity matches columns by name.
          const dstNames = new Map((await columnNames(dst)).map((n) => [n.toLowerCase(), n]));
          const pairs = (await columnNames(src)).filter((n) => dstNames.has(n.toLowerCase())).map((n) => ({ source: n, sink: dstNames.get(n.toLowerCase())! }));
          await linkColumns(pairs, src, dst, "DIRECT", (x) => `Copy activity default mapping (same name): ${x.source} → ${x.sink}`, copyId, worse(confidence, "MEDIUM"));
        }
      }
    }

    // ── mapping data flows ──
    for (const f of defs.dataflows) {
      const m = parseDataFlow(f, catalog);
      const flowId = await process("DATAFLOW", m.name, m.script || "(no script)", typeof f.properties?.description === "string" ? f.properties.description : null);
      for (const w of m.warnings) await warn(`Data flow "${m.name}": ${w}`);

      const sourceTargets = new Map<string, Target>();
      for (const s of m.sources) {
        if (s.object.ok) sourceTargets.set(s.stream, await resolve(s.object.object));
        else await warn(`Data flow "${m.name}", source "${s.stream}" not traced: ${s.object.reason}`);
      }
      const steps = m.transformations.length > 0 ? ` through ${cut(m.transformations.join(", "), 400)}` : "";
      for (const sink of m.sinks) {
        if (!sink.target.ok) { await warn(`Data flow "${m.name}", sink "${sink.stream}" not traced: ${sink.target.reason}`); continue; }
        const dst = await resolve(sink.target.object);
        for (const stream of sink.sourceStreams) {
          const src = sourceTargets.get(stream);
          if (!src) continue;
          await edge("ENTITY_LEVEL", src.entityId, dst.entityId, m.transformations.length > 0 ? "EXPRESSION" : "DIRECT",
            `Data flow "${m.name}": ${stream}${steps} → ${sink.stream}`, flowId, worse(src.confidence, dst.confidence));
        }
        let missing = 0;
        for (const col of sink.columns) {
          const d = await attribute(dst, col.sink);
          if (d === null) { missing++; continue; }
          const built = col.origins.map((o) => `${o.stream}.${o.column}`).join(" + ");
          for (const o of col.origins) {
            const src = sourceTargets.get(o.stream);
            if (!src) continue;
            const s = await attribute(src, o.column);
            if (s === null) { missing++; continue; }
            await edge("ATTRIBUTE_LEVEL", s, d, col.kind, `Data flow "${m.name}": ${col.sink} ⇐ ${built}`, flowId, worse(src.confidence, dst.confidence));
          }
        }
        if (missing > 0) await warn(`Data flow "${m.name}", sink "${sink.stream}": ${missing} column(s) are not columns of the catalog table — skipped`);
      }
    }

    // ── notebooks ──
    for (const n of defs.notebooks) {
      const m = parseNotebook(n, conn.connectionName);
      const noteId = await process("NOTEBOOK", m.name, cut(m.code || "(no code)", 60_000), typeof n.properties?.description === "string" ? n.properties.description : null);
      for (const w of m.warnings) await warn(`Notebook "${m.name}": ${w}`);
      if (m.reads.length === 0 || m.writes.length === 0) {
        await info(`Notebook "${m.name}": ${m.reads.length} input(s) and ${m.writes.length} output(s) found in the code — nothing to link`);
        continue;
      }
      for (const w of m.writes) {
        const dst = await resolve(w);
        for (const r of m.reads) {
          const src = await resolve(r);
          // Found by reading the code, not by running it: every input is assumed to feed every output.
          await edge("ENTITY_LEVEL", src.entityId, dst.entityId, "UNKNOWN", `Notebook "${m.name}" reads ${r.label} and writes ${w.label} (found by reading the code)`, noteId, "LOW");
        }
      }
    }

    // ── what is no longer in the factory / workspace ──
    const stale = await sql<{ id: number }[]>`
      SELECT process_id AS id FROM bayanat.lineage_processes
      WHERE connection_id = ${connectionId} AND process_type_code LIKE ${prefix + "\\_%"}
        AND process_id <> ALL(${[...seenProcesses]}::int[])
    `;
    if (stale.length > 0) {
      const ids = stale.map((s) => s.id);
      await sql`DELETE FROM bayanat.data_lineage WHERE process_id = ANY(${ids}::int[]) AND provenance_code = 'SCANNED'`;
      await sql`DELETE FROM bayanat.lineage_processes WHERE process_id = ANY(${ids}::int[]) AND parent_process_id IS NOT NULL`;
      await sql`DELETE FROM bayanat.lineage_processes WHERE process_id = ANY(${ids}::int[])`;
      await info(`Removed ${stale.length} process(es) that are no longer defined, with their links`);
    }
    await pruneOrphanPlaceholders();

    const placeholders = [...targets.values()].filter((t) => t.placeholder).length;
    await info(`Done: ${seenProcesses.size} process(es), ${tableLinks} table-level link(s), ${columnLinks} column-level link(s), ${linkedEntities.size} table(s) and file(s) linked`);
    if (placeholders > 0) await info(`${placeholders} object(s) were not found in the catalog and were added as placeholders — bind them in Data Lineage › Stitching Review, or crawl their source and crawl this one again`);

    await sql`
      UPDATE bayanat.lineage_scan_runs SET status_code = 'COMPLETED', finished_at = now(),
        processes_scanned_count = ${seenProcesses.size}, edges_created_count = ${tableLinks + columnLinks}, warnings = ${JSON.stringify(warnings)}::jsonb
      WHERE scan_run_id = ${scanRunId}
    `;
    // For these sources the three counters are: processes, tables linked, column links.
    await finishCrawlJob(jobId, seenProcesses.size, linkedEntities.size, columnLinks);
    await updateCrawlStatus(connectionId, "COMPLETED", undefined, { schemas: seenProcesses.size, tables: linkedEntities.size, columns: columnLinks });
    schedulePropagation("lineage-scan");
    return { processes: seenProcesses.size, tablesLinked: linkedEntities.size, tableLinks, columnLinks, warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await addCrawlJobLog(jobId, "ERROR", `Crawl failed: ${msg}`);
    await sql`UPDATE bayanat.lineage_scan_runs SET status_code = 'FAILED', finished_at = now(), warnings = ${JSON.stringify([...warnings, msg])}::jsonb WHERE scan_run_id = ${scanRunId}`;
    await failCrawlJob(jobId, msg);
    await updateCrawlStatus(connectionId, "FAILED", msg);
    throw err;
  }
}
