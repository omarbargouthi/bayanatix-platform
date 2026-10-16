// What Ask Bayanis needs to advise on a table's column classifications: each column's
// metadata, its current classification, the sensitive information type (SIT) and
// business/technical suggestions Bayanis already made, profiling statistics, and the
// organisation's classification levels and classification terms to choose from.
//
// Advice only: nothing here changes a column. Profiling sends statistics and value
// shapes, never values (top values, minimum, maximum and mean stay out), so no row-level
// data reaches the AI provider.
import { sql } from "@/lib/db";
import { helpDocForAssistant } from "@/lib/help/content";

const MAX_COLUMNS = 80;

type Rationale = { sampled_live?: boolean; hits?: { patternType?: string; matchRatio?: number; contribution?: number }[] } | null;

function parseJson<T>(v: unknown): T | null {
  if (v == null) return null;
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return null; } }
  return v as T;
}

/** "column name matched; 100% of sampled values matched" — the evidence, without patterns or values. */
function sitEvidence(raw: unknown): string | null {
  const r = parseJson<Rationale>(parseJson<unknown>(raw));
  if (!r?.hits?.length) return null;
  const parts = r.hits.map((h) =>
    h.patternType === "NAME_REGEX" ? "column name matched"
    : h.patternType === "VALUE_REGEX" ? `${Math.round((h.matchRatio ?? 0) * 100)}% of sampled values matched`
    : `${(h.patternType ?? "pattern").toLowerCase()} matched`);
  return `${parts.join("; ")}${r.sampled_live ? " (live sample)" : " (no live sample)"}`;
}

/** Value shapes such as "AAA-9999" only; anything that could be a literal value is dropped. */
function shapes(raw: unknown): string[] {
  const d = parseJson<Record<string, number> | { pattern: string; ratio?: number; count?: number }[]>(raw);
  if (!d) return [];
  const list = Array.isArray(d) ? d.map((x) => x.pattern) : Object.keys(d);
  return list.filter((p) => typeof p === "string" && /^[Aa9Xx\s\-_.@/:+()#,]*$/.test(p) && p.length <= 40).slice(0, 3);
}

// ── Candidate terms ──────────────────────────────────────────────────────────
// The classification terms whose name shares a meaningful word with the column's name,
// friendly name or description. The assistant chooses among these, so it cannot pick a
// term that does not exist or stretch an unrelated one to fit.
const GENERIC = new Set(["id", "no", "num", "number", "nbr", "code", "cd", "name", "nm", "type", "status", "date", "dt", "value",
  "the", "of", "and", "for", "a", "an", "is", "flag", "ind", "indicator", "text", "desc", "description", "key", "ref", "reference",
  // Whose data it is, not what it is: "first name of the customer" is a name, not a customer.
  "customer", "client", "employee", "person", "party", "user", "member", "citizen", "government", "record", "data", "info", "information"]);
const SYNONYMS: Record<string, string> = {
  dob: "birth", birthdate: "birth", born: "birth", sex: "gender", nid: "national", nin: "national", ssn: "national",
  phone: "mobile", tel: "mobile", telephone: "mobile", cell: "mobile", msisdn: "mobile", mail: "email", e_mail: "email",
  passport_no: "passport", licence: "license", dl: "driving", zip: "postal", postcode: "postal", salary: "salary", wage: "salary",
  medical: "health", diagnosis: "health", nationality: "nationality", marital: "marital", fingerprint: "fingerprint",
};
const stem = (w: string) => { const s = w.replace(/(ies)$/, "y").replace(/(es|s)$/, ""); return s.length >= 3 ? s : w; };
function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || GENERIC.has(raw)) continue;
    out.add(stem(SYNONYMS[raw] ?? raw));
  }
  return out;
}
type Term = { term: string; level: string | null; personalData: boolean; category: string | null };
function candidatesFor(text: string, terms: (Term & { words: Set<string> })[]): Term[] {
  const w = words(text);
  return terms
    .map((t) => ({ t, hits: [...t.words].filter((x) => w.has(x)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.t.words.size - b.t.words.size)
    .slice(0, 4)
    .map(({ t }) => ({ term: t.term, level: t.level, personalData: t.personalData, category: t.category }));
}

export async function classificationAdvice(entityId: number, onlyUnclassified: boolean) {
  const [table] = await sql<{ name: string; schema: string; source: string; sourceType: string; rowCount: number | null; category: string | null; schemaId: number }[]>`
    SELECT e.entity_name_text AS name, s.schema_name_text AS schema, ds.source_name_text AS source, ds.source_type_code AS "sourceType",
           e.row_count_estimate AS "rowCount", e.entity_category_code AS category, s.schema_id AS "schemaId"
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE e.entity_id = ${entityId}`;
  if (!table) return null;

  const rows = await sql<{
    attributeId: number; name: string; friendlyName: string | null; dataType: string | null; description: string | null;
    isPk: boolean | null; isFk: boolean | null; isNullable: boolean | null; isEncrypted: boolean | null;
    termName: string | null; termLevel: string | null; termPii: boolean | null; termCategory: string | null;
    sitTerm: string | null; sitLevel: string | null; sitPii: boolean | null; sitCategory: string | null;
    sitConfidence: number | null; sitStatus: string | null; sitRationale: unknown;
    usage: string | null; usageSuggested: string | null;
    totalRows: number | null; nullPct: number | null; distinct: number | null; uniquePct: number | null;
    minLen: number | null; maxLen: number | null; avgLen: number | null; patterns: unknown;
  }[]>`
    SELECT a.attribute_id AS "attributeId", a.physical_name_text AS name, a.friendly_name_text AS "friendlyName",
           a.data_type_text AS "dataType", a.description_text AS description,
           a.is_primary_key_indicator AS "isPk", a.is_foreign_key_indicator AS "isFk", a.is_nullable_indicator AS "isNullable", a.is_encrypted AS "isEncrypted",
           cg.term_name_text AS "termName", cg.classification_code AS "termLevel", cg.is_pii_indicator AS "termPii", cg.pi_category_code AS "termCategory",
           sg.term_name_text AS "sitTerm", sg.classification_code AS "sitLevel", sg.is_pii_indicator AS "sitPii", sg.pi_category_code AS "sitCategory",
           a.sit_suggestion_confidence AS "sitConfidence", a.sit_suggestion_status_code AS "sitStatus", a.sit_suggestion_rationale_json AS "sitRationale",
           a.attribute_class_code AS usage, a.suggested_class_code AS "usageSuggested",
           p.total_row_count AS "totalRows", p.null_percentage AS "nullPct", p.distinct_count AS distinct, p.uniqueness_percentage AS "uniquePct",
           p.min_length AS "minLen", p.max_length AS "maxLen", p.avg_length AS "avgLen", p.pattern_distribution AS patterns
    FROM bayanat.data_attributes a
    LEFT JOIN bayanat.asset_business_terms abt ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries cg ON cg.glossary_id = abt.glossary_id
    LEFT JOIN bayanat.business_glossaries sg ON sg.glossary_id = a.suggested_sit_glossary_id AND a.sit_suggestion_status_code <> 'NONE'
    LEFT JOIN LATERAL (
      SELECT * FROM bayanat.attribute_profile_results r WHERE r.attribute_id = a.attribute_id ORDER BY r.profile_timestamp DESC NULLS LAST LIMIT 1
    ) p ON true
    WHERE a.entity_id = ${entityId} AND coalesce(a.lifecycle_status_code, 'ACTIVE') <> 'DEPRECATED'
    ORDER BY a.attribute_id
  `;
  const all = rows.filter((r) => !onlyUnclassified || !r.termName);
  const shown = all.slice(0, MAX_COLUMNS);

  // Bayanis's own bands for a suggestion's confidence (Configuration › Sensitive Information Types).
  const [bands] = await sql<{ high: number; medium: number }[]>`
    SELECT high_band_threshold AS high, medium_band_threshold AS medium FROM bayanat.sit_settings WHERE settings_id = 1`;
  const band = (c: number | null) => c == null || !bands ? null : c >= Number(bands.high) ? "HIGH" : c >= Number(bands.medium) ? "MEDIUM" : "LOW";

  const terms = await sql<{ term: string; level: string | null; personalData: boolean; category: string | null }[]>`
    SELECT term_name_text AS term, classification_code AS level, coalesce(is_pii_indicator, false) AS "personalData", pi_category_code AS category
    FROM bayanat.business_glossaries
    WHERE term_type = 'TERM' AND classification_code IS NOT NULL
    ORDER BY term_name_text`;
  const termWords = terms.map((t) => ({ ...t, words: words(t.term) }));

  const columns = shown.map((r) => ({
    columnId: r.attributeId,
    name: r.name,
    friendlyName: r.friendlyName,
    dataType: r.dataType,
    description: r.description,
    key: r.isPk ? "primary key" : r.isFk ? "foreign key" : null,
    encrypted: !!r.isEncrypted,
    currentClassification: r.termName
      ? { term: r.termName, level: r.termLevel, personalData: !!r.termPii, personalDataCategory: r.termCategory }
      : null,
    sensitiveTypeSuggestion: r.sitTerm
      ? { term: r.sitTerm, level: r.sitLevel, personalData: !!r.sitPii, personalDataCategory: r.sitCategory,
          confidence: r.sitConfidence, confidenceBand: band(r.sitConfidence), status: r.sitStatus, evidence: sitEvidence(r.sitRationale) }
      : null,
    // Stated outright when empty, so "no matching term" is the only possible answer.
    candidateTerms: (() => {
      const c = candidatesFor(`${r.name} ${r.friendlyName ?? ""} ${r.description ?? ""}`, termWords);
      return c.length || r.sitTerm ? c : "NONE: no classification term matches this column; answer 'no matching term'";
    })(),
    businessOrTechnical: r.usage ?? r.usageSuggested ?? null,
    profile: r.totalRows != null || r.nullPct != null
      ? { rows: r.totalRows, nullPercent: r.nullPct, distinctValues: r.distinct, uniquePercent: r.uniquePct,
          length: r.minLen != null ? `${r.minLen}–${r.maxLen} (avg ${r.avgLen})` : null, valueShapes: shapes(r.patterns) }
      : null,
  }));

  const levels = await sql<{ code: string; label: string; description: string | null }[]>`
    SELECT lookup_code AS code, lookup_label AS label, description FROM bayanat.app_lookups
    WHERE lookup_group = 'CLASSIFICATION' AND is_active ORDER BY sort_order, lookup_code`;

  return {
    table: { id: entityId, name: table.name, schema: table.schema, source: table.source, sourceType: table.sourceType, rowCount: table.rowCount, tableType: table.category },
    columnCount: rows.length,
    classifiedColumns: rows.filter((r) => r.termName).length,
    columnsShown: columns.length,
    columnsNotShown: all.length - columns.length,
    columns,
    classificationLevels: levels,
    classificationTermCount: terms.length,
    // The Help Center's steps, so the answer can end with how to apply the advice.
    howToApply: helpDocForAssistant("classification", false)?.sections.find((s) => s.id === "how")?.body ?? null,
    howToApplyLink: "/help/classification#how",
    href: `/catalog/${table.schemaId}/tables/${entityId}`,
  };
}
