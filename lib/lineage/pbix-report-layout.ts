// Reads the report part of a .pbix: its pages, the visuals ("analyses") on each page
// and the model fields each visual uses. Two on-disk formats exist and both are read:
//  - the enhanced report format (PBIR): Report/definition/pages/<id>/page.json and
//    .../visuals/<id>/visual.json, one JSON file per page and per visual;
//  - the legacy format: a single UTF-16 "Report/Layout" JSON whose sections are the
//    pages and whose visualContainers carry their definition as a JSON string.
// Only what the lineage needs is extracted — no formatting, no layout.
import { unzipSync } from "fflate";

export type ReportField = {
  table: string;
  name: string;                       // model column or measure name
  kind: "column" | "measure";
  aggregation: string | null;         // "Sum", "Count"… when the visual aggregates a column
  role: string | null;                // the visual's well it sits in (Category, Values, Y…)
  label: string;                      // how the visual shows it ("Count of ID")
};
export type ReportVisual = {
  id: string; type: string; typeLabel: string; title: string | null;
  fields: ReportField[];
  filterTables: string[];             // tables only referenced by the visual's filters
  filters: { table: string; name: string; kind: "column" | "measure" }[];  // fields the visual is filtered by
};
export type ReportPage = { id: string; name: string; visuals: ReportVisual[] };

const AGGREGATIONS = ["Sum", "Average", "Distinct count", "Min", "Max", "Count", "Median", "Standard deviation", "Variance"];

const TYPE_LABELS: Record<string, string> = {
  tableEx: "Table", pivotTable: "Matrix", card: "Card", multiRowCard: "Multi-row card", cardVisual: "Card", kpi: "KPI",
  slicer: "Slicer", columnChart: "Column chart", clusteredColumnChart: "Column chart", hundredPercentStackedColumnChart: "Column chart",
  barChart: "Bar chart", clusteredBarChart: "Bar chart", hundredPercentStackedBarChart: "Bar chart", lineChart: "Line chart",
  areaChart: "Area chart", pieChart: "Pie chart", donutChart: "Donut chart", gauge: "Gauge", map: "Map", filledMap: "Map",
  treemap: "Treemap", waterfallChart: "Waterfall chart", funnel: "Funnel", scatterChart: "Scatter chart",
  lineClusteredColumnComboChart: "Combo chart", lineStackedColumnComboChart: "Combo chart", decompositionTreeVisual: "Decomposition tree",
};
function typeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function parseJson(bytes: Uint8Array): Json | null {
  for (const enc of ["utf-8", "utf-16le"]) {
    try {
      const text = new TextDecoder(enc, { fatal: true }).decode(bytes).replace(/^﻿/, "");
      return JSON.parse(text);
    } catch { /* try the next encoding */ }
  }
  return null;
}

/** A field expression (Column / Measure / Aggregation over a column) → the model field it reads. */
function resolveField(f: Json, alias: Record<string, string>): Omit<ReportField, "role" | "label"> | null {
  if (!f || typeof f !== "object") return null;
  const tableOf = (expr: Json): string | null => {
    const sr = expr?.SourceRef;
    return sr?.Entity ?? (sr?.Source ? alias[sr.Source] ?? null : null);
  };
  if (f.Column) { const t = tableOf(f.Column.Expression); return t && f.Column.Property ? { table: t, name: f.Column.Property, kind: "column", aggregation: null } : null; }
  if (f.Measure) { const t = tableOf(f.Measure.Expression); return t && f.Measure.Property ? { table: t, name: f.Measure.Property, kind: "measure", aggregation: null } : null; }
  if (f.Aggregation) {
    const inner = resolveField(f.Aggregation.Expression, alias);
    return inner ? { ...inner, aggregation: AGGREGATIONS[Number(f.Aggregation.Function)] ?? "Aggregate" } : null;
  }
  if (f.HierarchyLevel) return resolveField(f.HierarchyLevel.Expression?.Hierarchy?.Expression ? { Column: { Expression: f.HierarchyLevel.Expression.Hierarchy.Expression, Property: f.HierarchyLevel.Level } } : null, alias);
  return null;
}

function literalText(expr: Json): string | null {
  const v = expr?.expr?.Literal?.Value;
  if (typeof v !== "string") return null;
  const s = v.replace(/^'(.*)'$/s, "$1").replace(/''/g, "'").trim();
  return s || null;
}

function labelOf(f: Omit<ReportField, "role" | "label">, shown: unknown): string {
  if (typeof shown === "string" && shown.trim()) return shown.trim();
  return f.aggregation ? `${f.aggregation} of ${f.name}` : f.name;
}

function filterFieldsOf(filters: Json, alias: Record<string, string>): ReportVisual["filters"] {
  const out = new Map<string, ReportVisual["filters"][number]>();
  for (const flt of Array.isArray(filters) ? filters : []) {
    const r = resolveField(flt?.field ?? flt?.expression, alias);
    if (r) out.set(`${r.table}\u0000${r.name}`.toLowerCase(), { table: r.table, name: r.name, kind: r.kind });
  }
  return [...out.values()];
}

function filterTablesOf(filters: Json, alias: Record<string, string>, used: Set<string>): string[] {
  const out = new Set<string>();
  for (const flt of Array.isArray(filters) ? filters : []) {
    const r = resolveField(flt?.field ?? flt?.expression, alias);
    if (r && !used.has(r.table)) out.add(r.table);
  }
  return [...out];
}

// ── Enhanced report format (PBIR) ────────────────────────────────────────────

function readPbir(files: Record<string, Uint8Array>): ReportPage[] | null {
  const norm = new Map(Object.keys(files).map((k) => [k.replace(/^\/+/, ""), k]));
  const pageFiles = [...norm.keys()].filter((k) => /^Report\/definition\/pages\/[^/]+\/page\.json$/i.test(k));
  if (pageFiles.length === 0) return null;
  const order: string[] = parseJson(files[norm.get("Report/definition/pages/pages.json") ?? ""] ?? new Uint8Array())?.pageOrder ?? [];

  const pages: (ReportPage & { pos: number })[] = [];
  for (const pf of pageFiles) {
    const pageId = pf.split("/")[3];
    const page = parseJson(files[norm.get(pf)!]);
    if (!page) continue;
    const visuals: (ReportVisual & { y: number; x: number })[] = [];
    for (const vf of [...norm.keys()].filter((k) => k.startsWith(`Report/definition/pages/${pageId}/visuals/`) && k.endsWith("/visual.json"))) {
      const v = parseJson(files[norm.get(vf)!]);
      const visual = v?.visual;
      if (!visual?.visualType) continue;
      const fields: ReportField[] = [];
      for (const [role, well] of Object.entries<Json>(visual.query?.queryState ?? {})) {
        for (const p of well?.projections ?? []) {
          const r = resolveField(p.field, {});
          if (r) fields.push({ ...r, role, label: labelOf(r, p.displayName ?? p.nativeQueryRef) });
        }
      }
      visuals.push({
        id: v.name ?? vf.split("/")[5], type: visual.visualType, typeLabel: typeLabel(visual.visualType),
        title: literalText(visual.visualContainerObjects?.title?.[0]?.properties?.text),
        fields, filterTables: filterTablesOf(v.filterConfig?.filters, {}, new Set(fields.map((f) => f.table))),
        filters: filterFieldsOf(v.filterConfig?.filters, {}),
        y: Number(v.position?.y ?? 0), x: Number(v.position?.x ?? 0),
      });
    }
    visuals.sort((a, b) => a.y - b.y || a.x - b.x);
    const idx = order.indexOf(page.name ?? pageId);
    pages.push({ id: page.name ?? pageId, name: page.displayName ?? pageId, visuals, pos: idx < 0 ? 9999 : idx });
  }
  return pages.sort((a, b) => a.pos - b.pos);
}

// ── Legacy format (Report/Layout) ────────────────────────────────────────────

function readLegacy(files: Record<string, Uint8Array>): ReportPage[] | null {
  const key = Object.keys(files).find((k) => k.replace(/^\/+/, "").toLowerCase() === "report/layout");
  if (!key) return null;
  const layout = parseJson(files[key]);
  if (!layout?.sections) return null;
  const sections = [...layout.sections].sort((a: Json, b: Json) => Number(a.ordinal ?? 0) - Number(b.ordinal ?? 0));
  return sections.map((s: Json, si: number): ReportPage => {
    const visuals: (ReportVisual & { y: number; x: number })[] = [];
    for (const vc of s.visualContainers ?? []) {
      let cfg: Json = null;
      try { cfg = typeof vc.config === "string" ? JSON.parse(vc.config) : vc.config; } catch { cfg = null; }
      const sv = cfg?.singleVisual;
      if (!sv?.visualType) continue;
      const alias: Record<string, string> = {};
      for (const fr of sv.prototypeQuery?.From ?? []) if (fr?.Name && fr?.Entity) alias[fr.Name] = fr.Entity;
      const roleOf = new Map<string, string>();
      for (const [role, refs] of Object.entries<Json>(sv.projections ?? {})) for (const r of refs ?? []) if (r?.queryRef) roleOf.set(r.queryRef, role);
      const fields: ReportField[] = [];
      for (const sel of sv.prototypeQuery?.Select ?? []) {
        const r = resolveField(sel, alias);
        if (r) fields.push({ ...r, role: roleOf.get(sel.Name) ?? null, label: labelOf(r, sel.NativeReferenceName) });
      }
      let filters: Json = [];
      try { filters = typeof vc.filters === "string" ? JSON.parse(vc.filters) : (vc.filters ?? []); } catch { filters = []; }
      visuals.push({
        id: cfg.name ?? String(vc.id ?? visuals.length), type: sv.visualType, typeLabel: typeLabel(sv.visualType),
        title: literalText(sv.vcObjects?.title?.[0]?.properties?.text),
        fields, filterTables: filterTablesOf(filters, alias, new Set(fields.map((f) => f.table))),
        filters: filterFieldsOf(filters, alias),
        y: Number(vc.y ?? 0), x: Number(vc.x ?? 0),
      });
    }
    visuals.sort((a, b) => a.y - b.y || a.x - b.x);
    return { id: s.name ?? `section-${si}`, name: s.displayName ?? `Page ${si + 1}`, visuals };
  });
}

/** The report's pages in display order, or null when the file has no readable report part. */
export function readPbixReportPages(pbixBuf: Uint8Array): ReportPage[] | null {
  const files = unzipSync(pbixBuf, { filter: (f) => /^\/?Report\/(Layout$|definition\/pages\/)/i.test(f.name) });
  return readPbir(files) ?? readLegacy(files);
}
