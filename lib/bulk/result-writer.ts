// Bulk Upload — outcome/error workbook (spec §3.1 step 3 & 5): the same rows the
// user uploaded, plus a `_Result` column and a cell comment on any row with errors
// pinpointing exactly what failed (AC3: "error workbook pinpoints the cells").

import ExcelJS from "exceljs";
import { getFieldsForSheet, type SheetName } from "./sheets";
import type { RowPlan } from "./validate";

const SHEET_ORDER: SheetName[] = ["DataSources", "Tables", "Columns", "BusinessTerms"];

export async function buildResultWorkbook(plans: RowPlan[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const bySheet = new Map<SheetName, RowPlan[]>();
  for (const p of plans) {
    if (!bySheet.has(p.sheet)) bySheet.set(p.sheet, []);
    bySheet.get(p.sheet)!.push(p);
  }

  for (const sheetName of SHEET_ORDER) {
    const rows = bySheet.get(sheetName);
    if (!rows) continue;
    const fields = getFieldsForSheet(sheetName);
    const ws = workbook.addWorksheet(sheetName);
    ws.columns = [
      { header: "Row", key: "_row", width: 8 },
      { header: "_ID", key: "_ID", width: 10 },
      ...fields.filter((f) => f.kind !== "SYSTEM").map((f) => ({ header: f.header, key: f.key, width: 30 })),
      { header: "_Result", key: "_result", width: 20 },
      { header: "_Detail", key: "_detail", width: 60 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const plan of rows.sort((a, b) => a.rowNumber - b.rowNumber)) {
      const values: Record<string, unknown> = { _row: plan.rowNumber, _ID: plan.assetId ?? "(new)", _result: plan.outcome };
      for (const c of plan.changes) values[c.field] = c.newVal ?? "";
      const detailParts = [...plan.errors, ...plan.warnings];
      values._detail = detailParts.join(" | ");
      const excelRow = ws.addRow(values);

      const resultCell = excelRow.getCell("_result");
      const fill =
        plan.outcome === "ERROR" ? "FFF4CCCC" :
        plan.outcome === "SKIPPED_CONFLICT" ? "FFFCE5CD" :
        plan.outcome === "SKIPPED_NOOP" ? "FFF3F3F3" :
        "FFD9EAD3";
      resultCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };

      if (plan.errors.length > 0) {
        resultCell.note = { texts: plan.errors.map((e) => ({ text: `${e}\n` })) };
      }
    }
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
