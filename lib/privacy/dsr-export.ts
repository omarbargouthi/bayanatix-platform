// Data subject request → Excel, in the user's language: what the request needs
// done in each table on the retention path, the PI columns to address, the
// parameterised locate queries and the downstream copies to review.
import ExcelJS from "exceljs";
import type { I18nStrings } from "../i18n/strings";
import type { DsrManifest } from "./dsr";

export async function buildDsrWorkbook(m: DsrManifest, t: I18nStrings): Promise<Buffer> {
  const d = t.dsr;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bayanis";
  const head = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF201C55" } };
    r.alignment = { vertical: "middle", wrapText: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  const wrap = (ws: ExcelJS.Worksheet) => ws.eachRow((row, n) => { if (n > 1) row.alignment = { wrapText: true, vertical: "top" }; });
  const types = d.types as Record<string, string>, actions = d.actions as Record<string, string>, itemStatuses = d.itemStatuses as Record<string, string>;
  const holdText = (h: { caseReference: string; attributeName: string; operator: string; valueText: string; valueText2: string | null; logicOperator: string }, i: number) =>
    `${i > 0 ? h.logicOperator + " " : ""}${h.attributeName} ${h.operator} ${h.valueText}${h.valueText2 ? ` / ${h.valueText2}` : ""} (${h.caseReference})`;

  const sum = wb.addWorksheet(d.sheetSummary);
  sum.columns = [{ width: 30 }, { width: 90 }];
  const rows: [string, string | number][] = [
    [d.colReference, m.request.referenceCode],
    [d.requestType, types[m.request.requestType] ?? m.request.requestType],
    [d.category, m.category.name],
    [d.identifier, `${m.identifier.source} › ${m.identifier.schema} › ${m.identifier.table}.${m.identifier.column}`],
    [d.externalReference, m.request.externalReference ?? "—"],
    [d.receivedDate, m.request.receivedDate],
    [d.colDue, m.request.dueDate + (m.request.extensionReason ? ` — ${m.request.extensionReason}` : "")],
    [d.colStatus, (d.statuses as Record<string, string>)[m.request.statusCode] ?? m.request.statusCode],
    [d.schedule, m.schedule ? `${m.schedule.jurisdiction}: ${m.schedule.period} ${m.schedule.unit} from ${m.schedule.triggerEvent} → ${m.schedule.action}${m.schedule.technique ? ` (${m.schedule.technique})` : ""}` : d.noSchedule],
    [d.holds, m.categoryHolds.length ? m.categoryHolds.map((h) => `${h.caseReference} — ${h.caseName}`).join("; ") : d.none],
    ...(m.request.correctionDetails ? [[d.correctionDetails, m.request.correctionDetails] as [string, string]] : []),
    ...(m.warnings.length ? [[d.warnings, m.warnings.join("\n")] as [string, string]] : []),
    [d.generatedAt, new Date(m.generatedAt).toISOString().replace("T", " ").slice(0, 16)],
  ];
  for (const [k, v] of rows) {
    const r = sum.addRow([k, v]);
    r.getCell(1).font = { bold: true, color: { argb: "FF201C55" } };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }

  const tbl = wb.addWorksheet(d.sheetTables);
  tbl.columns = [
    { header: d.colOrder, width: 8 }, { header: d.colSource, width: 20 }, { header: d.colSchema, width: 14 }, { header: d.colTable, width: 26 },
    { header: d.colPath, width: 40 }, { header: d.action, width: 16 }, { header: d.colReason, width: 50 }, { header: d.piColumns, width: 30 },
    { header: d.colRetention, width: 44 }, { header: d.colHoldRules, width: 44 }, { header: d.owners, width: 22 },
    { header: d.statusLabel, width: 14 }, { header: d.note, width: 30 },
  ];
  for (const x of [...m.tables].sort((a, b) => a.executionOrder - b.executionOrder)) {
    tbl.addRow([
      x.executionOrder, x.source, x.schema, x.name,
      x.isRoot ? d.hopRoot : x.path.map((p) => `${p.fromTable}.${p.fromColumn} → ${p.toTable}.${p.toColumn}${p.extraCondition ? ` [${p.extraCondition}]` : ""}`).join("\n"),
      actions[x.action] ?? x.action, x.actionReason, x.piColumns.map((c) => c.name).join(", ") || d.noPi,
      x.retentionRule ?? "", x.holdRules.map(holdText).join("\n"), x.owners.join(", "),
      itemStatuses[x.item?.status ?? "PENDING"] ?? "", x.item?.note ?? "",
    ]);
  }
  head(tbl); wrap(tbl);

  const pi = wb.addWorksheet(d.sheetPi);
  pi.columns = [
    { header: d.colSource, width: 20 }, { header: d.colSchema, width: 14 }, { header: d.colTable, width: 26 }, { header: d.colColumn, width: 26 },
    { header: d.colDataType, width: 18 }, { header: d.colClassification, width: 26 }, { header: d.colPiCategory, width: 22 }, { header: d.action, width: 16 },
  ];
  for (const x of m.tables) for (const c of x.piColumns) pi.addRow([x.source, x.schema, x.name, c.name, c.dataType ?? "", c.classification ?? "", c.piCategory ?? "", actions[x.action] ?? x.action]);
  head(pi);

  const loc = wb.addWorksheet(d.sheetLocate);
  loc.columns = [{ header: d.colTable, width: 28 }, { header: d.colSource, width: 22 }, { header: d.colQuery, width: 110 }];
  for (const x of m.tables) loc.addRow([`${x.schema}.${x.name}`, `${x.source}${x.dbType ? ` (${x.dbType})` : ""}${x.host ? ` — ${x.host}/${x.database ?? ""}` : ""}`, x.locateSql]);
  head(loc); wrap(loc);
  loc.getColumn(3).font = { name: "Consolas", size: 10 };

  const cp = wb.addWorksheet(d.sheetCopies);
  cp.columns = [
    { header: d.copyFrom, width: 32 }, { header: d.colSource, width: 20 }, { header: d.colSchema, width: 16 }, { header: d.colTable, width: 28 },
    { header: d.colColumn, width: 24 }, { header: d.isPi, width: 14 }, { header: d.hop.replace(" {n}", ""), width: 8 },
  ];
  for (const c of m.downstreamCopies) cp.addRow([`${c.fromTable}.${c.fromColumn}`, c.source, c.schema, c.table, c.column, c.isPii ? d.isPi : d.notClassified, c.hops]);
  head(cp);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
