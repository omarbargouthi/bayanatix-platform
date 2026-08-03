// Bulk Download — builds the .xlsx workbook (spec §2.2) using exceljs (the free
// SheetJS "xlsx" package already in this repo can't write data validation, sheet
// protection, or comments — all required here, hence the new dependency).

import ExcelJS from "exceljs";
import { getFieldsForSheet, ROW_CAP_PER_FILE, type SheetName, type FieldDef } from "./sheets";
import { loadEnumValues, loadExistingTagNames, loadExistingTermNames } from "./enum-sources";
import type { SheetRows } from "./scope-resolver";

const SHEET_ORDER: SheetName[] = ["DataSources", "Tables", "Columns", "BusinessTerms"];

const HEADER_FILL: Record<FieldDef["kind"], string> = {
  SYSTEM: "FFD9D9D9",     // grey — locked
  EDITABLE: "FFFFFFFF",   // white
  REFERENCE: "FFE8F0FE",  // light blue — locked, informational
};

function colLetter(index0: number): string {
  let n = index0 + 1, s = "";
  while (n > 0) { const rem = (n - 1) % 26; s = String.fromCharCode(65 + rem) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function formatCellValue(field: FieldDef, value: unknown): unknown {
  // bigint columns (e.g. row_count_estimate) come back from postgres.js as native
  // JS BigInt (lib/db.ts `types: { bigint: postgres.BigInt }`) — exceljs can't
  // serialize those, same class of issue seen elsewhere in this codebase.
  if (typeof value === "bigint") value = Number(value);
  if (value == null) return "";
  if (field.type === "BOOLEAN") return value ? "TRUE" : "FALSE";
  if (field.type === "NUMBER") return typeof value === "string" ? Number(value) : value;
  return String(value);
}

export type WorkbookMeta = {
  exportId: string;
  scopeDescription: string;
  exportedByUserId: string;
  exportedAt: Date;
  schemaVersion: number;
};

export const TEMPLATE_SCHEMA_VERSION = 1;

/** Returns one workbook per up-to-ROW_CAP_PER_FILE-row chunk (spec §2.2: "larger
 *  scopes split into numbered files in one zip"). In practice every sheet in this
 *  app's demo data is far under the cap, so multi-file splitting is implemented but
 *  not exercised against real data here. */
export async function buildDownloadWorkbooks(sheetRows: SheetRows, meta: Omit<WorkbookMeta, "schemaVersion">): Promise<Buffer[]> {
  const maxRows = Math.max(0, ...Object.values(sheetRows).map((rows) => rows?.length ?? 0));
  const fileCount = Math.max(1, Math.ceil(maxRows / ROW_CAP_PER_FILE));

  const buffers: Buffer[] = [];
  for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
    const chunk: SheetRows = {};
    for (const [sheet, rows] of Object.entries(sheetRows) as [SheetName, Record<string, unknown>[]][]) {
      chunk[sheet] = rows.slice(fileIndex * ROW_CAP_PER_FILE, (fileIndex + 1) * ROW_CAP_PER_FILE);
    }
    buffers.push(await buildOneWorkbook(chunk, { ...meta, schemaVersion: TEMPLATE_SCHEMA_VERSION }, fileIndex + 1, fileCount));
  }
  return buffers;
}

async function buildOneWorkbook(sheetRows: SheetRows, meta: WorkbookMeta, fileIndex: number, fileCount: number): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bayanatix";
  workbook.created = meta.exportedAt;

  // ── _Lists — dropdown source ranges for every ENUM/TERM column ────────────────
  const listsSheet = workbook.addWorksheet("_Lists", { state: "veryHidden" });
  const listColumns: Record<string, string> = {}; // list name -> column letter on _Lists
  const listCounts: Record<string, number> = {};  // list name -> number of values written

  async function registerList(name: string, values: string[]): Promise<string> {
    if (listColumns[name]) return listColumns[name];
    const colIdx = Object.keys(listColumns).length;
    const letter = colLetter(colIdx);
    listsSheet.getCell(`${letter}1`).value = name;
    values.forEach((v, i) => { listsSheet.getCell(`${letter}${i + 2}`).value = v; });
    listColumns[name] = letter;
    listCounts[name] = values.length;
    return letter;
  }

  const enumSourcesUsed = new Set<string>();
  for (const sheet of SHEET_ORDER) {
    if (!sheetRows[sheet]) continue;
    for (const f of getFieldsForSheet(sheet)) if (f.enumSource) enumSourcesUsed.add(f.enumSource);
  }
  for (const source of enumSourcesUsed) {
    await registerList(source, await loadEnumValues(source as Parameters<typeof loadEnumValues>[0]));
  }
  const hasTermColumn = SHEET_ORDER.some((s) => sheetRows[s] && getFieldsForSheet(s).some((f) => f.type === "TERM"));
  if (hasTermColumn) await registerList("TERM", await loadExistingTermNames());
  const hasTagsColumn = SHEET_ORDER.some((s) => sheetRows[s] && getFieldsForSheet(s).some((f) => f.type === "TAGS"));
  if (hasTagsColumn) await registerList("TAGS_REFERENCE", await loadExistingTagNames());

  // ── One worksheet per populated sheet ──────────────────────────────────────────
  for (const sheetName of SHEET_ORDER) {
    const rows = sheetRows[sheetName];
    if (!rows) continue;
    const fields = getFieldsForSheet(sheetName);
    const ws = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = fields.map((f) => ({ header: f.header, key: f.key, width: f.type === "LONGTEXT" ? 40 : 20 }));

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    fields.forEach((f, i) => {
      headerRow.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL[f.kind] } };
    });

    for (const row of rows) {
      const values: Record<string, unknown> = {};
      for (const f of fields) values[f.key] = formatCellValue(f, row[f.key]);
      ws.addRow(values);
    }

    // Cell protection: EDITABLE columns unlocked, SYSTEM/REFERENCE stay locked.
    fields.forEach((f, i) => {
      const col = ws.getColumn(i + 1);
      col.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
        if (rowNumber === 1) return;
        cell.protection = { locked: f.kind !== "EDITABLE" };
      });
    });

    // Dropdown validation on ENUM/TERM columns, referencing the _Lists sheet.
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const listName = f.type === "ENUM" ? f.enumSource : f.type === "TERM" ? "TERM" : null;
      if (!listName) continue;
      const letter = listColumns[listName];
      if (!letter) continue;
      const count = Math.max(1, listCounts[listName] ?? 1);
      const range = `_Lists!$${letter}$2:$${letter}$${count + 1}`;
      const colLetterOnSheet = colLetter(i);
      for (let r = 2; r <= rows.length + 1; r++) {
        ws.getCell(`${colLetterOnSheet}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [range] };
      }
    }

    if (rows.length > 0) {
      await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true });
    }
  }

  // ── _Meta hidden sheet ───────────────────────────────────────────────────────
  const metaSheet = workbook.addWorksheet("_Meta", { state: "veryHidden" });
  metaSheet.addRows([
    ["export_id", meta.exportId],
    ["scope", meta.scopeDescription],
    ["schema_version", meta.schemaVersion],
    ["exported_at", meta.exportedAt.toISOString()],
    ["exported_by", meta.exportedByUserId],
    ["file_index", fileIndex],
    ["file_count", fileCount],
  ]);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
