// FR-9/FR-10 — Power BI Service + Fabric ingester (C4a/C4b), fixture-driven mode.
// Both share this one module (per spec: same scanner API, item type/shape decides
// classic-vs-Fabric), parsing the Admin scanner API's WorkspaceInfo scanResult shape.
// No live OAuth/API client in this build — see app/api/lineage/scan/route.ts's
// dev-only fixturePath branch, which is the acceptance-criteria test mode (§8).
import { sql } from "../db";
import { ensureSchema, ensureEntity, ensureAttribute } from "./catalog-upsert";
import { resolveStitch, type ExternalRef, type Confidence } from "./stitching";

// ── scanResult shape (trimmed to the fields this ingester consumes) ─────────

type SrColumn = { name: string; dataType?: string };
type SrMeasure = { name: string; expression: string; description?: string };
type SrTableSource = { expression?: string; lakehouseItemId?: string; tableName?: string };
type SrTable = { name: string; columns: SrColumn[]; measures?: SrMeasure[]; source?: SrTableSource[] };
type SrDataset = { id: string; name: string; targetStorageMode?: string; tables: SrTable[] };
type SrReport = { id: string; name: string; datasetId: string };
type SrDataflowQuery = { queryName: string; expression: string; destination?: { type: string; itemId: string; tableName: string } };
type SrDataflow = { objectId: string; name: string; generation?: number; description?: string; queries?: SrDataflowQuery[] };
type SrLakehouseTable = { name: string; columns: SrColumn[] };
type SrLakehouse = { id: string; name: string; extendedProperties?: { tables?: SrLakehouseTable[] } };
type SrWorkspace = {
  id: string; name: string;
  datasets?: SrDataset[]; reports?: SrReport[]; dashboards?: { id: string; name: string }[];
  dataflows?: SrDataflow[]; Lakehouse?: SrLakehouse[];
};
export type ScanResult = { workspaces: SrWorkspace[] };

function isFabricWorkspace(ws: SrWorkspace): boolean {
  return !!(ws.Lakehouse?.length) || !!ws.datasets?.some((d) => d.targetStorageMode === "DirectLake") || !!ws.dataflows?.some((d) => d.generation === 2);
}

// ── M-expression parsing (targeted extraction, not a full M parser — per spec) ─

type MSource = { ref: ExternalRef | null; renameMap: Map<string, string>; isSimple: boolean; lakehouseItemId: string | null; lakehouseTableName: string | null };

function parseM(expr: string): MSource {
  const pg = expr.match(/PostgreSQL\.Database\("([^"]+)"\s*,\s*"([^"]+)"\)/);
  const mssql = expr.match(/Sql\.Database\("([^"]+)"\s*,\s*"([^"]+)"\)/);
  const ora = expr.match(/Oracle\.Database\("([^"]+)"(?:\s*,\s*"([^"]+)")?\)/);
  let engine: string | null = null, host: string | null = null, database: string | null = null;
  if (pg) { engine = "POSTGRES"; host = pg[1]; database = pg[2]; }
  else if (mssql) { engine = "MSSQL"; host = mssql[1]; database = mssql[2]; }
  else if (ora) { engine = "ORACLE"; host = ora[1]; database = ora[2] ?? null; }

  const nav = expr.match(/\{\[Schema="([^"]+)"\s*,\s*Item="([^"]+)"\]\}/) ?? expr.match(/\{\[Item="([^"]+)"\]\}/);
  const schema = nav && nav.length === 3 ? nav[1] : null;
  const table = nav ? nav[nav.length - 1] : null;

  const renameMap = new Map<string, string>();
  for (const m of expr.matchAll(/\{"([^"]+)"\s*,\s*"([^"]+)"\}/g)) renameMap.set(m[1], m[2]);

  const complex = /Table\.(Join|NestedJoin|Combine|AddColumn|Group|Pivot|Unpivot)|each\s/.test(expr);

  const ref: ExternalRef | null = engine && table ? { engine, host, database, schema, object: table } : null;
  return { ref, renameMap, isSimple: !!ref && !complex, lakehouseItemId: null, lakehouseTableName: null };
}

// DAX measure column references: 'Table'[Column] or Table[Column] (no full DAX parse, per spec).
function extractDaxColumnRefs(dax: string): { table: string | null; column: string }[] {
  const refs: { table: string | null; column: string }[] = [];
  for (const m of dax.matchAll(/(?:'([^']+)'|([A-Za-z_][\w]*))\[([^\]]+)\]/g)) {
    refs.push({ table: m[1] ?? m[2] ?? null, column: m[3] });
  }
  return refs;
}

// ── GUID-keyed catalog upsert (asset_external_ids) ───────────────────────────

async function ensureEntityByExternalId(
  systemCode: string, externalIdText: string,
  schemaId: number, tableName: string, layerCode: "SEMANTIC_MODEL" | "REPORT" | "LAKEHOUSE",
  displayName?: string,
): Promise<number> {
  const [existing] = await sql<{ entityId: number }[]>`
    SELECT asset_id AS "entityId" FROM bayanat.asset_external_ids WHERE system_code = ${systemCode} AND external_id_text = ${externalIdText} AND asset_type_code = 'DATA_ENTITIES'
  `;
  if (existing) return existing.entityId;
  const entityId = await ensureEntity(schemaId, tableName, false, { layerCodeOverride: layerCode, displayName });
  await sql`
    INSERT INTO bayanat.asset_external_ids (asset_type_code, asset_id, system_code, external_id_text)
    VALUES ('DATA_ENTITIES', ${entityId}, ${systemCode}, ${externalIdText})
    ON CONFLICT (asset_type_code, asset_id, system_code) DO NOTHING
  `;
  return entityId;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };
function worseOf(a: Confidence, b: Confidence): Confidence { return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b; }

async function upsertLineageEdge(opts: {
  scope: "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL"; sourceAssetId: number; targetAssetId: number;
  transformationTypeCode: string; transformationLogicText: string; processId: number;
  confidenceCode: Confidence; connectionId: number;
}) {
  await sql`
    INSERT INTO bayanat.data_lineage
      (lineage_scope_code, asset_type_code, source_asset_id, target_asset_id,
       transformation_type_code, transformation_logic_text, process_id, provenance_code, confidence_code, connection_id, updated_by_user_id)
    VALUES (
      ${opts.scope}, ${opts.scope === "ENTITY_LEVEL" ? "DATA_ENTITIES" : "DATA_ATTRIBUTES"},
      ${opts.sourceAssetId}, ${opts.targetAssetId}, ${opts.transformationTypeCode}, ${opts.transformationLogicText},
      ${opts.processId}, 'SCANNED', ${opts.confidenceCode}, ${opts.connectionId}, 'powerbi_ingester'
    )
    ON CONFLICT (lineage_scope_code, source_asset_id, target_asset_id, COALESCE(process_id, -1))
    DO UPDATE SET transformation_type_code = EXCLUDED.transformation_type_code, transformation_logic_text = EXCLUDED.transformation_logic_text,
      confidence_code = EXCLUDED.confidence_code, last_updated_timestamp = now()
  `;
}

async function ensureProcess(connectionId: number, processTypeCode: string, processName: string, externalRefText: string, definitionText: string): Promise<{ id: number; isNew: boolean }> {
  const [existing] = await sql<{ id: number }[]>`
    SELECT process_id AS id FROM bayanat.lineage_processes WHERE connection_id = ${connectionId} AND process_name = ${processName} AND process_type_code = ${processTypeCode}
  `;
  if (existing) {
    await sql`UPDATE bayanat.lineage_processes SET external_ref_text = ${externalRefText}, definition_text = ${definitionText}, last_scanned_timestamp = now() WHERE process_id = ${existing.id}`;
    await sql`DELETE FROM bayanat.data_lineage WHERE process_id = ${existing.id} AND provenance_code = 'SCANNED'`;
    return { id: existing.id, isNew: false };
  }
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.lineage_processes (connection_id, process_type_code, process_name, external_ref_text, definition_text, last_scanned_timestamp)
    VALUES (${connectionId}, ${processTypeCode}, ${processName}, ${externalRefText}, ${definitionText}, now())
    RETURNING process_id AS id
  `;
  return { id: row.id, isNew: true };
}

// ── Main ingest ───────────────────────────────────────────────────────────────

export async function ingestPowerBiScanResult(scanResult: ScanResult, connectionId: number, triggeredByUserId: string): Promise<{ scanRunId: number; warnings: string[]; edgesCreated: number }> {
  const warnings: string[] = [];
  let edgesCreated = 0;

  const [scanRun] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.lineage_scan_runs (connection_id, status_code, triggered_by_user_id)
    VALUES (${connectionId}, 'RUNNING', ${triggeredByUserId})
    RETURNING scan_run_id AS id
  `;
  const scanRunId = scanRun.id;

  try {
    for (const ws of scanResult.workspaces) {
      const fabric = isFabricWorkspace(ws);
      const systemCode = fabric ? "FABRIC" : "POWERBI";
      const sourceTypeCode = fabric ? "FABRIC" : "POWERBI";
      const [dataSource] = await sql<{ id: number }[]>`SELECT data_source_id AS id FROM bayanat.data_sources WHERE source_type_code = ${sourceTypeCode} LIMIT 1`;
      if (!dataSource) { warnings.push(`Workspace "${ws.name}": no registered ${sourceTypeCode} data source — skipped (register one first).`); continue; }
      const schemaId = await ensureSchema(dataSource.id, ws.name);

      // Lakehouse tables (Fabric) — catalog first so dataflow destinations can resolve.
      const lakehouseTableEntity = new Map<string, number>(); // `${lakehouseId}/${tableName}` -> entityId
      for (const lh of ws.Lakehouse ?? []) {
        for (const t of lh.extendedProperties?.tables ?? []) {
          const extId = `${lh.id}/${t.name}`;
          const entityId = await ensureEntityByExternalId(systemCode, extId, schemaId, `${lh.name}.${t.name}`, "LAKEHOUSE", `Lakehouse: ${t.name}`);
          lakehouseTableEntity.set(extId, entityId);
          for (const col of t.columns) await ensureAttribute(entityId, col.name, col.dataType ?? null);
        }
      }

      // Semantic model (dataset) tables, columns, measures.
      const datasetTableEntity = new Map<string, number>(); // `${datasetId}::${tableName}` -> entityId
      for (const ds of ws.datasets ?? []) {
        // "Direct Lake" (two words) is Microsoft's own product term for targetStorageMode="DirectLake".
        const storageModeLabel = ds.targetStorageMode === "DirectLake" ? "Direct Lake" : (ds.targetStorageMode ?? "Import");
        const dataflowProcessName = ds.targetStorageMode === "DirectLake" ? `${ds.name} (${storageModeLabel})` : `${ds.name} (${storageModeLabel} refresh)`;
        const { id: dsProcessId } = await ensureProcess(connectionId, "PBI_DATASET", dataflowProcessName, ds.id, `Semantic model import${ds.targetStorageMode === "DirectLake" ? " (Direct Lake)" : ""} from source`);

        for (const table of ds.tables) {
          const entityName = `${ds.name} [${table.name}]`;
          const extId = `${ds.id}/${table.name}`;
          const entityId = await ensureEntityByExternalId(systemCode, extId, schemaId, entityName, "SEMANTIC_MODEL", entityName);
          datasetTableEntity.set(`${ds.id}::${table.name}`, entityId);

          const colAttrId = new Map<string, number>();
          for (const col of table.columns) colAttrId.set(col.name, await ensureAttribute(entityId, col.name, col.dataType ?? null));
          const measureAttrId = new Map<string, number>();
          for (const meas of table.measures ?? []) {
            measureAttrId.set(meas.name, await ensureAttribute(entityId, meas.name, "measure", { attributeClassCode: "MEASURE" }));
          }

          // ── Stitch this table's source (M expression, or Direct Lake lakehouse ref) ──
          const src = table.source?.[0];
          if (src?.lakehouseItemId && src.tableName) {
            // Direct Lake: table -> lakehouse table, HIGH confidence, column-level by exact name (no rename possible).
            const lhEntityId = lakehouseTableEntity.get(`${src.lakehouseItemId}/${src.tableName}`);
            if (lhEntityId) {
              await upsertLineageEdge({ scope: "ENTITY_LEVEL", sourceAssetId: lhEntityId, targetAssetId: entityId, transformationTypeCode: "DIRECT", transformationLogicText: `Direct Lake: ${table.name} over lakehouse table ${src.tableName}`, processId: dsProcessId, confidenceCode: "HIGH", connectionId });
              edgesCreated++;
              const lhCols = await sql<{ id: number; name: string }[]>`SELECT attribute_id AS id, physical_name_text AS name FROM bayanat.data_attributes WHERE entity_id = ${lhEntityId}`;
              for (const col of table.columns) {
                const lhCol = lhCols.find((c) => c.name.toLowerCase() === col.name.toLowerCase());
                if (!lhCol) continue;
                await upsertLineageEdge({ scope: "ATTRIBUTE_LEVEL", sourceAssetId: lhCol.id, targetAssetId: colAttrId.get(col.name)!, transformationTypeCode: "DIRECT", transformationLogicText: `Direct Lake column mapping: ${lhCol.name} -> ${col.name}`, processId: dsProcessId, confidenceCode: "HIGH", connectionId });
                edgesCreated++;
              }
            } else {
              warnings.push(`Table "${table.name}" (${ds.name}): Direct Lake source lakehouse table not found in this scan — entity created, unstitched.`);
            }
          } else if (src?.expression) {
            const parsed = parseM(src.expression);
            if (!parsed.ref) {
              warnings.push(`Table "${table.name}" (${ds.name}): could not extract a source table from its M expression — entity-level only, LOW confidence.`);
            } else {
              const stitch = await resolveStitch(parsed.ref, scanRunId);
              const srcEntityId = stitch.status === "RESOLVED" ? stitch.entityId : stitch.placeholderEntityId;
              const entityConfidence: Confidence = stitch.status === "RESOLVED" ? stitch.confidence : "LOW";
              await upsertLineageEdge({ scope: "ENTITY_LEVEL", sourceAssetId: srcEntityId, targetAssetId: entityId, transformationTypeCode: "DIRECT", transformationLogicText: `M: ${src.expression.replace(/\s+/g, " ").slice(0, 300)}`, processId: dsProcessId, confidenceCode: entityConfidence, connectionId });
              edgesCreated++;

              if (parsed.isSimple && stitch.status === "RESOLVED") {
                const srcAttrs = await sql<{ id: number; name: string }[]>`SELECT attribute_id AS id, physical_name_text AS name FROM bayanat.data_attributes WHERE entity_id = ${srcEntityId}`;
                for (const col of table.columns) {
                  // Invert the rename map (old -> new) to find what the source column was called.
                  let sourceColName = col.name;
                  for (const [oldName, newName] of parsed.renameMap) if (newName === col.name) { sourceColName = oldName; break; }
                  const srcAttr = srcAttrs.find((a) => a.name.toLowerCase() === sourceColName.toLowerCase());
                  if (!srcAttr) continue;
                  await upsertLineageEdge({ scope: "ATTRIBUTE_LEVEL", sourceAssetId: srcAttr.id, targetAssetId: colAttrId.get(col.name)!, transformationTypeCode: "DIRECT", transformationLogicText: `M: Table.RenameColumns({"${sourceColName}","${col.name}"})`, processId: dsProcessId, confidenceCode: "MEDIUM", connectionId });
                  edgesCreated++;
                }
              } else if (stitch.status === "RESOLVED") {
                warnings.push(`Table "${table.name}" (${ds.name}): M expression too complex to map columns (merge/custom column/etc.) — entity-level only, LOW confidence.`);
              }
            }
          }

          // ── Measures: attribute <- referenced columns in the same model table ──
          for (const meas of table.measures ?? []) {
            const refs = extractDaxColumnRefs(meas.expression).filter((r) => !r.table || r.table === table.name);
            let resolved = 0;
            for (const ref of refs) {
              const attrId = colAttrId.get(ref.column);
              if (!attrId) continue;
              resolved++;
              await upsertLineageEdge({ scope: "ATTRIBUTE_LEVEL", sourceAssetId: attrId, targetAssetId: measureAttrId.get(meas.name)!, transformationTypeCode: "MEASURE", transformationLogicText: `${meas.name} = ${meas.expression}`, processId: dsProcessId, confidenceCode: resolved > 0 ? "MEDIUM" : "LOW", connectionId });
              edgesCreated++;
            }
            if (resolved === 0) warnings.push(`Measure "${meas.name}" (${ds.name}): no column references resolved within its own table — LOW confidence, unlinked.`);
          }
        }
      }

      // Reports <- their dataset's table entities (entity-level, DIRECT).
      for (const report of ws.reports ?? []) {
        const { id: reportProcessId } = await ensureProcess(connectionId, "PBI_REPORT", `${report.name} (binding)`, report.id, `Report bound to dataset ${report.datasetId}`);
        const reportEntityId = await ensureEntityByExternalId(systemCode, report.id, schemaId, report.name, "REPORT", report.name);
        const ds = (ws.datasets ?? []).find((d) => d.id === report.datasetId);
        for (const table of ds?.tables ?? []) {
          const tableEntityId = datasetTableEntity.get(`${report.datasetId}::${table.name}`);
          if (!tableEntityId) continue;
          await upsertLineageEdge({ scope: "ENTITY_LEVEL", sourceAssetId: tableEntityId, targetAssetId: reportEntityId, transformationTypeCode: "DIRECT", transformationLogicText: `Report "${report.name}" reads model table ${table.name}`, processId: reportProcessId, confidenceCode: "HIGH", connectionId });
          edgesCreated++;
        }
      }

      // Fabric Dataflow Gen2 — M source stitching + destination lakehouse table.
      for (const df of ws.dataflows ?? []) {
        const { id: dfProcessId } = await ensureProcess(connectionId, "FABRIC_DATAFLOW", df.name, df.objectId, df.description ?? `Fabric Dataflow Gen2: ${df.name}`);
        for (const q of df.queries ?? []) {
          if (!q.destination || q.destination.type !== "Lakehouse") { warnings.push(`Dataflow "${df.name}" query "${q.queryName}": non-lakehouse destination not handled in this build.`); continue; }
          const destEntityId = lakehouseTableEntity.get(`${q.destination.itemId}/${q.destination.tableName}`);
          if (!destEntityId) { warnings.push(`Dataflow "${df.name}" query "${q.queryName}": destination lakehouse table not found in this scan.`); continue; }

          const parsed = parseM(q.expression);
          if (!parsed.ref) { warnings.push(`Dataflow "${df.name}" query "${q.queryName}": could not extract a source table from its M expression.`); continue; }
          const stitch = await resolveStitch(parsed.ref, scanRunId);
          const srcEntityId = stitch.status === "RESOLVED" ? stitch.entityId : stitch.placeholderEntityId;
          const entityConfidence: Confidence = stitch.status === "RESOLVED" ? stitch.confidence : "LOW";
          await upsertLineageEdge({ scope: "ENTITY_LEVEL", sourceAssetId: srcEntityId, targetAssetId: destEntityId, transformationTypeCode: "DIRECT", transformationLogicText: `Dataflow Gen2 ${df.name}: source ${parsed.ref.schema ?? ""}.${parsed.ref.object} -> destination ${q.destination.tableName}`, processId: dfProcessId, confidenceCode: entityConfidence, connectionId });
          edgesCreated++;

          if (stitch.status === "RESOLVED") {
            const srcAttrs = await sql<{ id: number; name: string }[]>`SELECT attribute_id AS id, physical_name_text AS name FROM bayanat.data_attributes WHERE entity_id = ${srcEntityId}`;
            const destAttrs = await sql<{ id: number; name: string }[]>`SELECT attribute_id AS id, physical_name_text AS name FROM bayanat.data_attributes WHERE entity_id = ${destEntityId}`;
            for (const destAttr of destAttrs) {
              const srcAttr = srcAttrs.find((a) => a.name.toLowerCase() === destAttr.name.toLowerCase());
              if (!srcAttr) continue;
              await upsertLineageEdge({ scope: "ATTRIBUTE_LEVEL", sourceAssetId: srcAttr.id, targetAssetId: destAttr.id, transformationTypeCode: "DIRECT", transformationLogicText: `Dataflow Gen2: ${srcAttr.name} -> ${q.destination.tableName}.${destAttr.name}`, processId: dfProcessId, confidenceCode: worseOf(entityConfidence, "HIGH"), connectionId });
              edgesCreated++;
            }
          }
        }
      }
    }

    await sql`UPDATE bayanat.lineage_scan_runs SET status_code = 'COMPLETED', finished_at = now(), edges_created_count = ${edgesCreated}, warnings = ${JSON.stringify(warnings)}::jsonb WHERE scan_run_id = ${scanRunId}`;
    return { scanRunId, warnings, edgesCreated };
  } catch (err) {
    await sql`UPDATE bayanat.lineage_scan_runs SET status_code = 'FAILED', finished_at = now(), warnings = ${JSON.stringify([...warnings, String(err)])}::jsonb WHERE scan_run_id = ${scanRunId}`;
    throw err;
  }
}
