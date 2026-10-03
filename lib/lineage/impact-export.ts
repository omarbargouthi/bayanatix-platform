// "Assess a change" → Excel: the planned change, every impacted downstream asset
// (marked whether it is selected for review) and the metadata-propagation effects,
// so the list can be shared outside Bayanis. Recomputed server-side from current
// lineage — the same data the panel shows.
import ExcelJS from "exceljs";
import { sql } from "../db";
import type { I18nStrings } from "../i18n/strings";
import { getDownstreamImpact, type ImpactAssetRow, type LineageAssetType } from "../queries/lineage";
import { previewPropagation, type PreviewScenario } from "./propagation";

export type ImpactExportInput = {
  assetType: LineageAssetType; assetId: number;
  changeType: string; priority: string; details: string;
  selected: string[] | null;          // "DATA_ENTITIES:12" keys; null = all
  planned: string | null;             // glossary id, "none" (remove own classification) or null
};

const keyOf = (a: { assetType: string; assetId: number }) => `${a.assetType}:${a.assetId}`;

export async function buildImpactWorkbook(input: ImpactExportInput, t: I18nStrings, exportedBy: string): Promise<{ buffer: Buffer; fileName: string }> {
  const x = t.impactExport, lt = t.lineageTools, types = t.lineage.objectTypes as Record<string, string>;

  // The asset being changed, fully qualified.
  const [focus] = await sql<{ source: string | null; schema: string | null; table: string; column: string | null; entityId: number }[]>`
    SELECT d.source_name_text AS source, s.schema_name_text AS schema, e.entity_name_text AS table,
           ${input.assetType === "DATA_ATTRIBUTES" ? sql`a.physical_name_text` : sql`NULL::text`} AS column, e.entity_id AS "entityId"
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources d ON d.data_source_id = s.data_source_id
    ${input.assetType === "DATA_ATTRIBUTES"
      ? sql`JOIN bayanat.data_attributes a ON a.entity_id = e.entity_id AND a.attribute_id = ${input.assetId}`
      : sql`WHERE e.entity_id = ${input.assetId}`}
  `;
  if (!focus) throw new Error("Asset not found");
  const focusLabel = [focus.source, focus.schema, focus.table].filter(Boolean).join(" › ") + (focus.column ? `.${focus.column}` : ` (${x.wholeTable})`);

  // Impacted assets — one row per asset, nearest hop (as in the panel).
  const report = await getDownstreamImpact(input.assetType, input.assetId, 10);
  const byKey = new Map<string, ImpactAssetRow>();
  for (const a of report.levels.flatMap((l) => l.assets)) {
    const prev = byKey.get(keyOf(a));
    if (!prev || a.depth < prev.depth) byKey.set(keyOf(a), a);
  }
  const assets = [...byKey.values()].sort((a, b) => a.depth - b.depth || (a.parentEntityName ?? a.name).localeCompare(b.parentEntityName ?? b.name));
  const selected = new Set(input.selected ?? assets.map(keyOf));
  const owners = new Set(assets.filter((a) => selected.has(keyOf(a)) && a.ownerName).map((a) => a.ownerName));

  // Propagation effects for the same scenario the panel shows.
  const columns = input.assetType === "DATA_ATTRIBUTES"
    ? [input.assetId]
    : (await sql<{ id: number }[]>`SELECT attribute_id AS id FROM bayanat.data_attributes WHERE entity_id = ${input.assetId}`).map((r) => Number(r.id));
  const scenario: PreviewScenario = input.changeType === "REMOVE" ? "REMOVE"
    : input.assetType === "DATA_ATTRIBUTES" && input.planned ? "RECLASSIFY" : "NONE";
  const newTerm = scenario === "RECLASSIFY" && input.planned !== "none" ? Number(input.planned) : null;
  const preview = await previewPropagation({ columns, scenario, newTerm: Number.isFinite(newTerm) ? newTerm : null });
  const plannedLabel = scenario !== "RECLASSIFY" ? null
    : input.planned === "none" ? t.propagationPreview.removeClass
    : preview.options.find((o) => o.id === newTerm)?.name ?? input.planned;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Bayanis";
  const style = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF201C55" } };
    r.alignment = { vertical: "middle", wrapText: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (ws.rowCount > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  };

  // ── Summary ──
  const sum = wb.addWorksheet(x.sheetSummary);
  sum.columns = [{ width: 28 }, { width: 80 }];
  const rows: [string, string | number | Date][] = [
    [x.assetChanged, focusLabel],
    [x.changeType, (lt.changeTypes as Record<string, string>)[input.changeType] ?? input.changeType],
    [x.priority, (lt.priorities as Record<string, string>)[input.priority] ?? input.priority],
    [x.details, input.details || "—"],
    ...(plannedLabel ? [[x.plannedClass, plannedLabel] as [string, string]] : []),
    [x.impactedCount, assets.length],
    [x.selectedCount, assets.filter((a) => selected.has(keyOf(a))).length],
    [x.ownersCount, owners.size],
    [x.exportedBy, exportedBy],
    [x.exportedAt, new Date()],
  ];
  for (const [k, v] of rows) {
    const r = sum.addRow([k, v]);
    r.getCell(1).font = { bold: true, color: { argb: "FF201C55" } };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    if (v instanceof Date) r.getCell(2).numFmt = "yyyy-mm-dd hh:mm";
  }

  // ── Impacted assets ──
  const ws = wb.addWorksheet(x.sheetAssets);
  ws.columns = [
    { header: x.colSelected, key: "selected", width: 12 },
    { header: x.colHop, key: "hop", width: 7 },
    { header: x.colLevel, key: "level", width: 10 },
    { header: x.colSource, key: "source", width: 22 },
    { header: x.colSchema, key: "schema", width: 16 },
    { header: x.colTable, key: "table", width: 30 },
    { header: x.colColumn, key: "column", width: 24 },
    { header: x.colType, key: "type", width: 16 },
    { header: x.colOwner, key: "owner", width: 20 },
    { header: x.colQuality, key: "quality", width: 13 },
    { header: x.colTransformation, key: "transformation", width: 18 },
    { header: x.colLogic, key: "logic", width: 50 },
    { header: x.colProcess, key: "process", width: 26 },
  ];
  const quality = t.lineage.quality as Record<string, string>;
  for (const a of assets) {
    const isCol = a.assetType === "DATA_ATTRIBUTES";
    ws.addRow({
      selected: selected.has(keyOf(a)) ? x.yes : x.no, hop: a.depth, level: isCol ? x.levelColumn : x.levelTable,
      source: a.sourceName ?? "", schema: a.schemaName ?? "", table: isCol ? a.parentEntityName ?? "" : a.name, column: isCol ? a.name : "",
      type: types[a.objectTypeCode ?? ""] ?? a.objectTypeCode ?? "", owner: a.ownerName ?? "",
      quality: a.qualityStatus === "UNKNOWN" ? "" : quality[a.qualityStatus.toLowerCase()] ?? a.qualityStatus,
      transformation: a.transformationTypeName ?? a.transformationTypeCode ?? "", logic: a.transformationLogicText ?? "", process: a.processName ?? "",
    }).getCell("logic").alignment = { wrapText: true, vertical: "top" };
  }
  style(ws);

  // ── Metadata propagation ──
  const pp = wb.addWorksheet(x.sheetPropagation);
  pp.columns = [
    { header: x.colEffect, key: "effect", width: 30 },
    { header: x.colHop, key: "hop", width: 7 },
    { header: x.colSource, key: "source", width: 22 },
    { header: x.colSchema, key: "schema", width: 16 },
    { header: x.colTable, key: "table", width: 30 },
    { header: x.colColumn, key: "column", width: 24 },
    { header: x.colBefore, key: "before", width: 26 },
    { header: x.colAfter, key: "after", width: 26 },
    { header: x.colPersonal, key: "pi", width: 13 },
  ];
  const srcNames = new Map(assets.map((a) => [a.parentEntityName ?? a.name, a.sourceName ?? ""]));
  const loc = (c: { entityName: string; schemaName: string | null; columnName: string; hop: number }) =>
    ({ hop: c.hop, source: srcNames.get(c.entityName) ?? "", schema: c.schemaName ?? "", table: c.entityName, column: c.columnName });
  const nm = (term: { name: string } | null) => term?.name ?? x.none;
  if (scenario === "NONE") {
    for (const r of preview.currentFlows) pp.addRow({ effect: x.effectInherits, ...loc(r), before: r.term.name, after: r.term.name, pi: r.term.isPii ? x.yes : x.no });
  } else {
    for (const r of preview.changes) pp.addRow({ effect: x.effectChanges, ...loc(r), before: nm(r.before), after: nm(r.after), pi: r.after?.isPii || r.before?.isPii ? x.yes : x.no });
  }
  for (const r of preview.protectedColumns) pp.addRow({ effect: x.effectKeeps, ...loc(r), before: r.own.name, after: r.own.name, pi: r.own.isPii ? x.yes : x.no });
  for (const r of preview.newSuggestions) pp.addRow({ effect: x.effectSuggested, ...loc(r), before: x.none, after: r.term.name, pi: r.term.isPii ? x.yes : x.no });
  for (const r of preview.openSuggestions) pp.addRow({ effect: `${x.effectOpen} — ${(t.propagationPreview.fields as Record<string, string>)[r.field] ?? r.field}`, ...loc(r), after: r.value ?? "" });
  style(pp);

  const stamp = new Date().toISOString().slice(0, 10);
  const safe = `${focus.table}${focus.column ? "." + focus.column : ""}`.replace(/[^\w.-]+/g, "_").slice(0, 60);
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), fileName: `impact-${safe}-${stamp}.xlsx` };
}
