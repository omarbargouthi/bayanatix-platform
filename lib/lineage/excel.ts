// Lineage in Excel: the upload template, the export of a lineage view (same
// columns, so an export can be edited and uploaded back), and the import job.
import ExcelJS from "exceljs";
import { sql } from "../db";
import { updateJobProgress, finishJob, failJob } from "../queries/background-jobs";
import { ensureExternalEntity, EXTERNAL_SOURCE_NAME } from "./manual-edges";
import { submitLineageChanges, type LineageOp } from "./changes";
import { findOrCreateManualProcess } from "./manual-processes";

export const LINEAGE_IMPORT_JOB_TYPE = "LINEAGE_IMPORT";

export const COLUMNS = [
  { key: "sourceSystem", header: "Source System", width: 22 },
  { key: "sourceSchema", header: "Source Schema", width: 18 },
  { key: "sourceTable",  header: "Source Table",  width: 26 },
  { key: "sourceColumn", header: "Source Column", width: 22 },
  { key: "targetSystem", header: "Target System", width: 22 },
  { key: "targetSchema", header: "Target Schema", width: 18 },
  { key: "targetTable",  header: "Target Table",  width: 26 },
  { key: "targetColumn", header: "Target Column", width: 22 },
  { key: "transformationType", header: "Transformation Type", width: 20 },
  { key: "logic", header: "Logic / Notes", width: 40 },
  { key: "process", header: "Process", width: 28 },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];
export type LineageRow = Record<ColKey, string>;

const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF201C55" } };

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
  row.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

async function transformationTypes(): Promise<{ code: string; name: string; description: string | null }[]> {
  return sql`
    SELECT transformation_type_code AS code, transformation_type_name_text AS name, description_text AS description
    FROM bayanat.lineage_transformation_types WHERE transformation_type_code <> 'UNKNOWN'
    ORDER BY transformation_type_name_text
  `;
}

function addLineageSheet(wb: ExcelJS.Workbook, rows: LineageRow[], extra?: { header: string; width: number; values: string[] }) {
  const ws = wb.addWorksheet("Lineage");
  ws.columns = [
    ...COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width })),
    ...(extra ? [{ header: extra.header, key: "extra", width: extra.width }] : []),
  ];
  rows.forEach((r, i) => ws.addRow({ ...r, ...(extra ? { extra: extra.values[i] ?? "" } : {}) }));
  styleHeader(ws);
  return ws;
}

async function addReferenceSheets(wb: ExcelJS.Workbook) {
  const help = wb.addWorksheet("Instructions");
  help.columns = [{ width: 110 }];
  [
    "How to fill the Lineage sheet",
    "",
    "• One row = data flowing from a Source to a Target.",
    "• Source Table and Target Table are required. System and Schema are optional, but add them when a table name exists in more than one place.",
    "• System = the data source name as shown in the Data Catalog.",
    `• For something that isn't in the catalog (an application, file feed, report tool), put "${EXTERNAL_SOURCE_NAME}" as the System and any name as the Table; it is created as an external asset.`,
    "• Fill both Source Column and Target Column to record column-level lineage (the table-level link is added too). Leave both empty for a table-level link only.",
    "• Transformation Type: a code or name from the Transformation Types sheet. Leave empty for Manual (table rows) or Direct Copy (column rows).",
    "• Process (optional): the named process the flow belongs to, e.g. \"Nightly ETL to the data warehouse\". A new name creates the process. Exported scanned links show their scanned process (info only).",
    "• Uploading the same row again updates it — nothing is duplicated. Links found by scanners are not changed.",
    "• Rows that can't be matched are returned in a rejected-rows file with the reason, ready to fix and upload again.",
  ].forEach((line, i) => {
    const r = help.addRow([line]);
    if (i === 0) r.font = { bold: true, size: 13 };
  });

  const types = wb.addWorksheet("Transformation Types");
  types.columns = [{ header: "Code", key: "code", width: 16 }, { header: "Name", key: "name", width: 22 }, { header: "Description", key: "description", width: 70 }];
  for (const t of await transformationTypes()) types.addRow(t);
  styleHeader(types);
}

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bayanis";
  addLineageSheet(wb, [{
    sourceSystem: "CRM Database", sourceSchema: "crm", sourceTable: "customer_account", sourceColumn: "account_id",
    targetSystem: "Analytics_DW", targetSchema: "dw", targetTable: "dim_customer", targetColumn: "customer_key",
    transformationType: "DIRECT", logic: "Example row — replace or delete", process: "Nightly ETL to the data warehouse",
  }]);
  await addReferenceSheets(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const PROVENANCE_HEADER = "Provenance (info only)";

/** Every lineage link (table and column level) touching any of these tables, in the
 *  template's columns — for Bulk Operations' "Include lineage". */
export async function lineageRowsForEntities(entityIds: number[]): Promise<{ rows: LineageRow[]; provenance: string[] }> {
  if (entityIds.length === 0) return { rows: [], provenance: [] };
  const found = await sql<(LineageRow & { prov: string; confirmed: boolean })[]>`
    WITH l AS (
      SELECT dl.*,
        CASE WHEN dl.lineage_scope_code = 'ATTRIBUTE_LEVEL' THEN sa.entity_id ELSE dl.source_asset_id END AS src_entity,
        CASE WHEN dl.lineage_scope_code = 'ATTRIBUTE_LEVEL' THEN ta.entity_id ELSE dl.target_asset_id END AS tgt_entity,
        sa.physical_name_text AS src_col, ta.physical_name_text AS tgt_col
      FROM bayanat.data_lineage dl
      LEFT JOIN bayanat.data_attributes sa ON dl.lineage_scope_code = 'ATTRIBUTE_LEVEL' AND sa.attribute_id = dl.source_asset_id
      LEFT JOIN bayanat.data_attributes ta ON dl.lineage_scope_code = 'ATTRIBUTE_LEVEL' AND ta.attribute_id = dl.target_asset_id
    )
    SELECT sd.source_name_text AS "sourceSystem", ss.schema_name_text AS "sourceSchema", se.entity_name_text AS "sourceTable", coalesce(l.src_col, '') AS "sourceColumn",
           td.source_name_text AS "targetSystem", ts.schema_name_text AS "targetSchema", te.entity_name_text AS "targetTable", coalesce(l.tgt_col, '') AS "targetColumn",
           coalesce(l.transformation_type_code, '') AS "transformationType", coalesce(l.transformation_logic_text, '') AS logic,
           coalesce(p.process_name, '') AS process, l.provenance_code AS prov, coalesce(l.is_confirmed, false) AS confirmed
    FROM l
    JOIN bayanat.data_entities se ON se.entity_id = l.src_entity JOIN bayanat.data_schemas ss ON ss.schema_id = se.schema_id JOIN bayanat.data_sources sd ON sd.data_source_id = ss.data_source_id
    JOIN bayanat.data_entities te ON te.entity_id = l.tgt_entity JOIN bayanat.data_schemas ts ON ts.schema_id = te.schema_id JOIN bayanat.data_sources td ON td.data_source_id = ts.data_source_id
    LEFT JOIN bayanat.lineage_processes p ON p.process_id = l.process_id
    WHERE l.src_entity = ANY(${entityIds}) OR l.tgt_entity = ANY(${entityIds})
    ORDER BY te.entity_name_text, l.lineage_scope_code DESC, l.tgt_col NULLS FIRST, se.entity_name_text
  `;
  return {
    rows: found.map(({ prov: _p, confirmed: _c, ...r }) => r),
    provenance: found.map((r) => (r.prov === "SCANNED" ? (r.confirmed ? "Scanned (confirmed)" : "Scanned") : "Manual")),
  };
}

/** Adds the Lineage + Transformation Types sheets to an existing workbook buffer. */
export async function appendLineageSheet(buffer: Buffer, rows: LineageRow[], provenance: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  if (wb.getWorksheet("Lineage")) wb.removeWorksheet(wb.getWorksheet("Lineage")!.id);
  addLineageSheet(wb, rows, { header: PROVENANCE_HEADER, width: 20, values: provenance });
  if (!wb.getWorksheet("Transformation Types")) {
    const types = wb.addWorksheet("Transformation Types");
    types.columns = [{ header: "Code", key: "code", width: 16 }, { header: "Name", key: "name", width: 22 }, { header: "Description", key: "description", width: 70 }];
    for (const t of await transformationTypes()) types.addRow(t);
    styleHeader(types);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** True when the workbook has a Lineage sheet in the template's format. */
export async function hasLineageSheet(buffer: Buffer): Promise<boolean> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.getWorksheet("Lineage");
  if (!ws) return false;
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell) => headers.push(cellText(cell.value).toLowerCase()));
  return headers.includes("source table") && headers.includes("target table") && ws.rowCount > 1;
}

export async function buildExport(rows: LineageRow[], provenance: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bayanis";
  addLineageSheet(wb, rows, { header: PROVENANCE_HEADER, width: 20, values: provenance });
  await addReferenceSheets(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── Import ────────────────────────────────────────────────────────────────────

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v && v.result != null) return String(v.result).trim();
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
  }
  return String(v).trim();
}

async function readRows(buffer: Buffer): Promise<{ rows: LineageRow[]; provenance: string[]; error?: string }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.getWorksheet("Lineage") ?? wb.worksheets[0];
  if (!ws) return { rows: [], provenance: [], error: "The file has no sheets" };
  const headerIdx = new Map<ColKey, number>();
  let provenanceCol: number | null = null;
  ws.getRow(1).eachCell((cell, col) => {
    const h = cellText(cell.value).toLowerCase();
    const match = COLUMNS.find((c) => c.header.toLowerCase() === h);
    if (match) headerIdx.set(match.key, col);
    if (h === PROVENANCE_HEADER.toLowerCase()) provenanceCol = col;
  });
  if (!headerIdx.has("sourceTable") || !headerIdx.has("targetTable")) {
    return { rows: [], provenance: [], error: "Header row must include \"Source Table\" and \"Target Table\" — download the template for the expected columns" };
  }
  const rows: LineageRow[] = [];
  const provenance: string[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r = Object.fromEntries(COLUMNS.map((c) => [c.key, headerIdx.has(c.key) ? cellText(row.getCell(headerIdx.get(c.key)!).value) : ""])) as LineageRow;
    if (Object.values(r).some((v) => v !== "")) {
      rows.push(r);
      provenance.push(provenanceCol ? cellText(row.getCell(provenanceCol).value) : "");
    }
  });
  return { rows, provenance };
}

type Resolver = {
  entity(system: string, schema: string, table: string): Promise<number | string>;
  column(entityId: number, name: string): Promise<number | null>;
  type(value: string, fallback: string): string | null;
};

async function makeResolver(): Promise<Resolver> {
  const types = await transformationTypes();
  const entityCache = new Map<string, number | string>();
  const columnCache = new Map<string, number | null>();
  return {
    async entity(system, schema, table) {
      const key = [system, schema, table].map((s) => s.toLowerCase()).join("|");
      if (entityCache.has(key)) return entityCache.get(key)!;
      let result: number | string;
      if (system.toLowerCase() === EXTERNAL_SOURCE_NAME.toLowerCase()) {
        result = await ensureExternalEntity(table);
      } else {
        const matches = await sql<{ id: number }[]>`
          SELECT e.entity_id AS id
          FROM bayanat.data_entities e
          JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
          JOIN bayanat.data_sources d ON d.data_source_id = s.data_source_id
          WHERE lower(e.entity_name_text) = ${table.toLowerCase()}
            ${schema ? sql`AND lower(s.schema_name_text) = ${schema.toLowerCase()}` : sql``}
            ${system ? sql`AND lower(d.source_name_text) = ${system.toLowerCase()}` : sql``}
          LIMIT 5
        `;
        const where = [system, schema, table].filter(Boolean).join(".");
        result = matches.length === 1 ? Number(matches[0].id)
          : matches.length === 0 ? `Table not found in the catalog: ${where}`
          : `"${where}" matches ${matches.length} tables — add the System and Schema`;
      }
      entityCache.set(key, result);
      return result;
    },
    async column(entityId, name) {
      const key = `${entityId}|${name.toLowerCase()}`;
      if (columnCache.has(key)) return columnCache.get(key)!;
      const [row] = await sql<{ id: number }[]>`
        SELECT attribute_id AS id FROM bayanat.data_attributes WHERE entity_id = ${entityId} AND lower(physical_name_text) = ${name.toLowerCase()} LIMIT 1
      `;
      const id = row ? Number(row.id) : null;
      columnCache.set(key, id);
      return id;
    },
    type(value, fallback) {
      if (!value) return fallback;
      const v = value.toLowerCase();
      return types.find((t) => t.code.toLowerCase() === v || t.name.toLowerCase() === v)?.code ?? null;
    },
  };
}

export async function runLineageImport(jobId: number, userId: string, fileName: string, buffer: Buffer): Promise<void> {
  try {
    const read = await readRows(buffer);
    const { error } = read;
    // Scanned links in an export are read-only: skip them (they'd otherwise come
    // back as manual copies of the scanned link).
    const scannedSkipped = read.rows.filter((_r, i) => /^scanned/i.test(read.provenance[i] ?? "")).length;
    const rows = read.rows.filter((_r, i) => !/^scanned/i.test(read.provenance[i] ?? ""));
    if (error) { await failJob(jobId, error); return; }

    const resolve = await makeResolver();
    const rejected: { row: LineageRow; reason: string }[] = [];
    const ops: LineageOp[] = [];
    let imported = 0, columnLinks = 0, processed = 0;
    const processCache = new Map<string, number>();
    await updateJobProgress(jobId, 0, rows.length);

    for (const r of rows) {
      processed++;
      const reason = await (async (): Promise<string | null> => {
        if (!r.sourceTable || !r.targetTable) return "Source Table and Target Table are required";
        if (!!r.sourceColumn !== !!r.targetColumn) return "Fill both Source Column and Target Column, or neither";
        // Resolve a catalog side before an external one, so a row rejected for a
        // bad catalog table doesn't leave a newly-created external asset behind.
        const isExternal = (system: string) => system.toLowerCase() === EXTERNAL_SOURCE_NAME.toLowerCase();
        const order = isExternal(r.sourceSystem) && !isExternal(r.targetSystem) ? ["target", "source"] as const : ["source", "target"] as const;
        const ids: { source?: number; target?: number } = {};
        for (const side of order) {
          const id = side === "source"
            ? await resolve.entity(r.sourceSystem, r.sourceSchema, r.sourceTable)
            : await resolve.entity(r.targetSystem, r.targetSchema, r.targetTable);
          if (typeof id === "string") return `${side === "source" ? "Source" : "Target"}: ${id}`;
          ids[side] = id;
        }
        const src = ids.source!, tgt = ids.target!;
        if (src === tgt && !r.sourceColumn) return "Source and target are the same table";

        let srcCol: number | null = null, tgtCol: number | null = null;
        if (r.sourceColumn) {
          srcCol = await resolve.column(src, r.sourceColumn);
          if (srcCol == null) return `Source column "${r.sourceColumn}" not found on ${r.sourceTable}`;
          tgtCol = await resolve.column(tgt, r.targetColumn);
          if (tgtCol == null) return `Target column "${r.targetColumn}" not found on ${r.targetTable}`;
          if (srcCol === tgtCol) return "Source and target are the same column";
        }
        const typeCode = resolve.type(r.transformationType, srcCol != null ? "DIRECT" : "MANUAL");
        if (!typeCode) return `Unknown Transformation Type "${r.transformationType}" — see the Transformation Types sheet`;
        let processId: number | null = null;
        if (r.process) {
          const p = processCache.get(r.process.toLowerCase()) ?? await findOrCreateManualProcess(r.process, userId);
          if (typeof p !== "number") return `Process: ${p.error}`;
          processCache.set(r.process.toLowerCase(), p);
          processId = p;
        }

        // A column row also implies the table link — added only if missing, so it
        // never overwrites notes already on that table link.
        if (src !== tgt) {
          ops.push(srcCol != null
            ? { op: "CREATE", scope: "ENTITY_LEVEL", sourceId: src, targetId: tgt, typeCode: "MANUAL", logic: null, keepExisting: true, processId }
            : { op: "CREATE", scope: "ENTITY_LEVEL", sourceId: src, targetId: tgt, typeCode, logic: r.logic || null, processId });
        }
        if (srcCol != null && tgtCol != null) {
          ops.push({ op: "CREATE", scope: "ATTRIBUTE_LEVEL", sourceId: srcCol, targetId: tgtCol, typeCode, logic: r.logic || null, processId });
          columnLinks++;
        }
        return null;
      })();
      if (reason) rejected.push({ row: r, reason }); else imported++;
      if (processed % 25 === 0 || processed === rows.length) await updateJobProgress(jobId, processed, rows.length);
    }

    // The whole file is one proposal: approved (or applied, with no workflow mapped) together.
    let submitted: { mode: string; requestId: number | null } = { mode: "NONE", requestId: null };
    if (ops.length > 0) {
      const res = await submitLineageChanges(ops, userId, {
        origin: "IMPORT", title: `Lineage import: ${fileName} (${imported} row(s))`, note: `Imported from ${fileName}`,
      });
      if ("error" in res) { await failJob(jobId, res.error); return; }
      submitted = res;
    }

    const log = Buffer.from([
      `Lineage import — ${new Date().toISOString()}`,
      `File: ${fileName}`,
      `Rows read: ${rows.length + scannedSkipped}, accepted: ${imported} (column-level: ${columnLinks}), rejected: ${rejected.length}${scannedSkipped ? `, scanned links skipped (read-only): ${scannedSkipped}` : ""}`,
      submitted.mode === "PENDING" ? `Sent for approval as request #${submitted.requestId} — the links appear once it is approved.`
        : submitted.mode === "APPLIED" ? "Applied (no approval workflow is mapped to Manual Lineage Change)." : "Nothing to apply.",
      ...(rejected.length ? ["", "Rejected rows:", ...rejected.map((x) => `  ${x.row.sourceTable}.${x.row.sourceColumn || "*"} → ${x.row.targetTable}.${x.row.targetColumn || "*"}: ${x.reason}`)] : []),
    ].join("\n") + "\n", "utf-8");

    let rejectedFile: Buffer | undefined;
    if (rejected.length) {
      const wb = new ExcelJS.Workbook();
      wb.creator = "Bayanis";
      addLineageSheet(wb, rejected.map((x) => x.row), { header: "Reason", width: 60, values: rejected.map((x) => x.reason) });
      await addReferenceSheets(wb);
      rejectedFile = Buffer.from(await wb.xlsx.writeBuffer());
    }

    await finishJob(jobId, {
      resultJson: { rowsRead: rows.length + scannedSkipped, imported, columnLinks, rejected: rejected.length, scannedSkipped, mode: submitted.mode, requestId: submitted.requestId },
      logFileData: log,
      ...(rejectedFile ? {
        resultFileData: rejectedFile,
        resultFileName: `lineage-import-rejected-${jobId}.xlsx`,
        resultFileMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      } : {}),
    });
  } catch (e) {
    await failJob(jobId, (e as Error).message);
  }
}
