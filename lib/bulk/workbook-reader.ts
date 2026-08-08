// Bulk Upload — parses an uploaded workbook (spec §3.1 step 1). Matches columns by
// HEADER TEXT against lib/bulk/sheets.ts's field registry, not position, so a user
// reordering columns in Excel doesn't break the round-trip. Accepts any subset of
// the sheets/rows from the original export.

import ExcelJS from "exceljs";
import { getFieldsForSheet, TEMPLATE_SCHEMA_VERSION, type SheetName } from "./sheets";

export type ParsedRow = { rowNumber: number; values: Record<string, string> };
export type ParsedWorkbook = {
  meta: { exportId: string | null; scopeDescription: string | null; schemaVersion: number | null; exportedAt: string | null; exportedBy: string | null } | null;
  schemaVersionMismatch: boolean;
  sheets: Partial<Record<SheetName, ParsedRow[]>>;
};

const SHEET_NAMES: SheetName[] = ["DataSources", "Tables", "Columns", "BusinessTerms", "CustomAssets", "CustomAssetLinks"];

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("richText" in value) return (value.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in value) return String((value as { text: unknown }).text ?? "");
    if ("result" in value) return String((value as { result: unknown }).result ?? "");
    if (value instanceof Date) return value.toISOString();
  }
  return String(value).trim();
}

export async function parseUploadedWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  let meta: ParsedWorkbook["meta"] = null;
  const metaSheet = workbook.getWorksheet("_Meta");
  if (metaSheet) {
    const kv: Record<string, string> = {};
    metaSheet.eachRow((row) => {
      const key = cellText(row.getCell(1).value);
      const val = cellText(row.getCell(2).value);
      if (key) kv[key] = val;
    });
    meta = {
      exportId: kv.export_id ?? null,
      scopeDescription: kv.scope ?? null,
      schemaVersion: kv.schema_version ? Number(kv.schema_version) : null,
      exportedAt: kv.exported_at ?? null,
      exportedBy: kv.exported_by ?? null,
    };
  }
  const schemaVersionMismatch = meta?.schemaVersion != null && meta.schemaVersion < TEMPLATE_SCHEMA_VERSION;

  const sheets: ParsedWorkbook["sheets"] = {};
  for (const sheetName of SHEET_NAMES) {
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) continue;
    const fields = getFieldsForSheet(sheetName);

    const headerRow = ws.getRow(1);
    const colForField: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const header = cellText(cell.value);
      const field = fields.find((f) => f.header === header);
      if (field) colForField[field.key] = colNumber;
    });
    if (Object.keys(colForField).length === 0) continue; // no recognizable columns — skip this sheet

    const rows: ParsedRow[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (row.cellCount === 0) continue;
      const values: Record<string, string> = {};
      let hasAnyValue = false;
      for (const [key, colNumber] of Object.entries(colForField)) {
        const text = cellText(row.getCell(colNumber).value);
        values[key] = text;
        if (text) hasAnyValue = true;
      }
      if (!hasAnyValue) continue; // fully blank row — skip silently
      rows.push({ rowNumber: r, values });
    }
    if (rows.length > 0) sheets[sheetName] = rows;
  }

  return { meta, schemaVersionMismatch, sheets };
}
