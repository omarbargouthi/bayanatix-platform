// How an impact assessment's catalog facts and findings are worded, in the reader's
// language. Used by the screens and by the PDF export.
import type { I18nStrings } from "../i18n/strings";
import { pickTranslation } from "../i18n-admin/translated-column";
import type { DpiaChange, DpiaFacts, DpiaFlag, DpiaSuggestionReason } from "./dpia-types";

export const fill = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
// Dates and times are isolated as left-to-right runs, or an ISO date inside an Arabic sentence reads backwards.
export const day = (iso: string | null | undefined) => (iso ? `\u2066${iso.slice(0, 10)}\u2069` : "—");
export const stamp = (iso: string | null | undefined) => (iso ? `\u2066${iso.replace("T", " ").slice(0, 16)}\u2069` : "—");

/** Catalog types are named in the user's language; a custom type by its own translations, else the name its admin gave it. */
export const assetTypeLabel = (t: I18nStrings, typeCode: string, typeName: string, lang?: string, translations?: Record<string, string> | null) =>
  (t.dpia.assetTypes as Record<string, string>)[typeCode] ?? (lang ? pickTranslation(typeName, translations ?? null, lang) : typeName);

/** The two categories the catalog facts make up themselves, rather than read from pi_category_types. */
const categoryName = (t: I18nStrings, code: string, name: string) =>
  code === "UNCATEGORISED" ? t.dpia.facts.uncategorised : code === "SENSITIVE" && name === "SENSITIVE" ? t.dpia.facts.sensitiveClass : name;

export const flagText = (t: I18nStrings, f: DpiaFlag) => {
  // The sensitive-data finding lists category names, or the class itself for a column classified sensitive without one.
  const detail = f.code === "SENSITIVE_PI" && f.detail ? f.detail.split(", ").map((x) => (x === "SENSITIVE" ? t.dpia.facts.sensitiveClass : x)).join(", ") : f.detail;
  return fill((t.dpia.flags as Record<string, string>)[f.code] ?? f.code, { n: f.n.toLocaleString() }) + (detail ? ` (${detail})` : "");
};

/** One thing the catalog says now that it did not say at the screening, submission or decision. */
export function changeText(t: I18nStrings, c: DpiaChange): string {
  const head = fill((t.dpiaWatch.changes as Record<string, string>)[c.code] ?? c.code, { n: c.n.toLocaleString(), finding: c.flag ? flagText(t, c.flag) : "" });
  // Sensitive categories are named; a column classified sensitive without a category has no name to add.
  const items = c.code === "NEW_SENSITIVE" ? c.items.filter((i) => i !== "SENSITIVE") : c.items;
  if (!items.length) return head;
  const more = c.code !== "NEW_SENSITIVE" && c.n > items.length ? ` ${fill(t.dpia.facts.more, { n: c.n - items.length })}` : "";
  return `${head}: ${items.join(", ")}${more}`;
}

/** Why the catalog suggests screening an asset. */
export const reasonText = (t: I18nStrings, r: DpiaSuggestionReason) =>
  fill((t.dpiaWatch.reasons as Record<string, string>)[r.code] ?? r.code, { n: r.n.toLocaleString(), detail: r.detail ?? "" }) +
  (r.code === "SENSITIVE_PI" && r.detail ? ` (${r.detail})` : "");

export type FactBlock = "SUBJECT" | "LEGAL_BASIS" | "PERSONAL_DATA" | "ACCESS" | "SCALE" | "FLOWS" | "RECIPIENTS" | "RETENTION";
export const FACT_BLOCKS: FactBlock[] = ["SUBJECT", "PERSONAL_DATA", "SCALE", "FLOWS", "RECIPIENTS", "ACCESS", "RETENTION"];

/** One block of catalog facts as plain lines. Empty when the catalog has nothing to say. */
export function factLines(t: I18nStrings, facts: DpiaFacts | null, block: FactBlock): string[] {
  if (!facts) return [];
  const f = t.dpia.facts;
  const out: string[] = [];
  const more = (shown: number, total: number) => { if (total > shown) out.push(fill(f.more, { n: total - shown })); };
  const relatedLines = () => facts.related.map((r) => `${r.relation}: ${r.name} (${r.typeName})`);
  if (block === "SUBJECT" && facts.subject) {
    out.push(`${facts.subject.typeName}: ${facts.subject.name}`);
    if (facts.subject.description) out.push(facts.subject.description);
    for (const a of facts.subject.attributes) out.push(`${a.label}: ${a.value}`);
    out.push(...relatedLines());
  }
  if (block === "LEGAL_BASIS") {
    const own = facts.subject?.attributes.find((a) => a.code === "LEGAL_BASIS");
    if (own) out.push(`${own.label}: ${own.value}`);
    for (const s of facts.sharing) if (s.legalBasis) out.push(fill(f.sharingBasis, { title: s.title, basis: s.legalBasis }));
    for (const basis of [...new Set(facts.access.grants.map((g) => g.legalBasis).filter(Boolean))]) out.push(fill(f.accessBasis, { basis: basis as string }));
  }
  if (block === "PERSONAL_DATA" && facts.personalData.columnCount > 0) {
    out.push(fill(f.piSummary, { n: facts.personalData.columnCount, tables: facts.scope.tables.filter((x) => x.piColumns > 0).length }));
    for (const c of facts.personalData.categories) out.push(`${categoryName(t, c.code, c.name)}: ${c.count}${c.sensitive ? ` — ${f.sensitive}` : ""}`);
    const cols = facts.personalData.columns.slice(0, 15);
    for (const c of cols) out.push(`${c.source} › ${c.table}.${c.column}${c.term ? ` — ${c.term}` : ""}`);
    more(cols.length, facts.personalData.columnCount);
  }
  if (block === "ACCESS") {
    if (facts.access.grantCount) out.push(fill(f.grants, { n: facts.access.grantCount, users: facts.access.userCount }));
    for (const g of facts.access.grants.slice(0, 8)) out.push(`${g.user} — ${g.asset}${g.purpose ? `: ${g.purpose}` : ""}`);
    more(Math.min(8, facts.access.grants.length), facts.access.grantCount);
    if (facts.owners.length) out.push(fill(f.owners, { names: facts.owners.join(", ") }));
  }
  if (block === "SCALE" && facts.scope.tableCount > 0) {
    out.push(fill(f.scale, { sources: facts.scope.sources.join(", "), tables: facts.scope.tableCount, columns: facts.scope.columnCount }));
    if (facts.scope.rowEstimate != null) out.push(fill(f.largest, { n: Math.round(facts.scope.rowEstimate).toLocaleString() }));
  }
  if (block === "FLOWS" && facts.flows.tables.length > 0) {
    out.push(fill(f.flowSummary, { n: facts.flows.tables.length }));
    if (facts.flows.systems.length) out.push(fill(f.flowSystems, { systems: facts.flows.systems.join(", ") }));
    const rows = facts.flows.tables.slice(0, 12);
    for (const x of rows) out.push(`${x.source} › ${x.schema}.${x.table} — ${fill(x.unclassified ? f.flowColsUnclassified : f.flowCols, { n: x.columns, u: x.unclassified })}`);
    more(rows.length, facts.flows.tables.length);
  }
  if (block === "RECIPIENTS") {
    for (const s of facts.sharing) {
      const scope = (f.sharingScopes as Record<string, string>)[s.scope] ?? s.scope;
      out.push(`${s.reference ? `${s.reference} ` : ""}${s.title}${s.counterparty ? ` — ${s.counterparty}` : ""} (${scope}, ${s.status})${s.crossBorder ? ` — ${f.crossBorder}` : ""}`);
    }
    if (!facts.subject) out.push(...relatedLines());
  }
  if (block === "RETENTION") {
    for (const c of facts.retention.categories) out.push(`${c.name}: ${c.schedule ?? f.noSchedule}`);
    if (facts.retention.tablesWithoutCategory.length) out.push(fill(f.noCategory, { n: facts.retention.tablesWithoutCategory.length, tables: facts.retention.tablesWithoutCategory.slice(0, 8).join(", ") }));
    for (const h of facts.retention.holds) out.push(fill(f.hold, { ref: h.reference, name: h.name }));
  }
  return out;
}
