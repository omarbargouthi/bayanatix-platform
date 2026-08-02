// AI Metadata Enrichment — Capability B, Tier 1: deterministic DQ rule suggestion
// (spec §3.2). Pure functions over a ContextPackage plus a small amount of extra
// evidence the caller assembles (referenced-lookup domain values) — no LLM, no DB
// access here, so this tier never depends on LLM availability (NFR-5).

import type { ContextPackage } from "./context";

export type RuleLogicType = "THRESHOLD" | "REGEX" | "SQL_QUERY";
export type Severity = "INFO" | "WARNING" | "CRITICAL";
export type Provenance = "PROFILING" | "STRUCTURE" | "GLOSSARY" | "LLM";

export type DqRuleDraft = {
  dimensionCode: string;
  ruleNameText: string;
  ruleTemplateCode: string;
  ruleConfig: Record<string, unknown>;
  ruleLogicTypeCode: RuleLogicType;
  ruleDefinitionText: string | null;
  thresholdJson: Record<string, unknown>;
  severityLevelCode: Severity;
  provenanceCode: Provenance;
  evidenceJson: Record<string, unknown>;
};

export type Tier1Settings = {
  nullCheckBufferPct: number;
  nullCheckSoftThresholdPct: number;
  uniquenessBufferPct: number;
};

const FORMAT_PATTERNS: { test: RegExp; pattern: string; label: string }[] = [
  { test: /email/i, pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", label: "email" },
  { test: /phone|mobile|contact_no/i, pattern: "^\\+?[0-9()\\-\\s]{7,20}$", label: "phone" },
  { test: /iban/i, pattern: "^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$", label: "IBAN" },
  { test: /national_id|national_no|civil_id/i, pattern: "^[0-9]{8,15}$", label: "national ID" },
];

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function isNumericType(dataType: string): boolean {
  return /int|numeric|decimal|float|double|real|money/i.test(dataType);
}

function isTextType(dataType: string): boolean {
  return /char|text|string/i.test(dataType);
}

/**
 * Domain/allowed-values evidence is assembled by the caller (needs a second query
 * against the referenced lookup table's own profiling) — passed in rather than
 * fetched here so this module stays DB-free.
 */
export type DomainEvidence = { refTable: string; refColumn: string; values: string[] } | null;

export function suggestTier1ColumnRules(ctx: ContextPackage, settings: Tier1Settings, domain: DomainEvidence): DqRuleDraft[] {
  const drafts: DqRuleDraft[] = [];
  const p = ctx.profiling;
  const colLabel = `${ctx.entityName}.${ctx.physicalName}`;

  // ── NULL check (Completeness) ────────────────────────────────────────────────
  if (p?.nullPct != null) {
    const nullPct = Number(p.nullPct);
    if (nullPct === 0) {
      drafts.push({
        dimensionCode: "COMP", ruleNameText: `${colLabel}: no nulls`, ruleTemplateCode: "NOT_NULL",
        ruleConfig: {}, ruleLogicTypeCode: "THRESHOLD", ruleDefinitionText: null,
        thresholdJson: { metric: "null_pct", operator: "<=", value: 0, buffer: 0 },
        severityLevelCode: "WARNING", provenanceCode: "PROFILING",
        evidenceJson: { null_pct: nullPct, row_count: p.rowCount, profiled_at: p.profiledAt },
      });
    } else if (nullPct <= settings.nullCheckSoftThresholdPct) {
      const maxNullPct = round(nullPct + settings.nullCheckBufferPct);
      drafts.push({
        dimensionCode: "COMP", ruleNameText: `${colLabel}: completeness rate`, ruleTemplateCode: "COMPLETENESS_RATE",
        ruleConfig: { max_null_pct: maxNullPct }, ruleLogicTypeCode: "THRESHOLD", ruleDefinitionText: null,
        thresholdJson: { metric: "null_pct", operator: "<=", value: maxNullPct, buffer: settings.nullCheckBufferPct },
        severityLevelCode: "WARNING", provenanceCode: "PROFILING",
        evidenceJson: { null_pct: nullPct, row_count: p.rowCount, profiled_at: p.profiledAt },
      });
    }
  }

  // ── Uniqueness ────────────────────────────────────────────────────────────────
  if (p?.distinctCount != null && p.rowCount && !ctx.isPrimaryKey) {
    const uniquePct = (Number(p.distinctCount) / Number(p.rowCount)) * 100;
    if (uniquePct >= 99.5) {
      drafts.push({
        dimensionCode: "UNIQUENESS", ruleNameText: `${colLabel}: uniqueness`, ruleTemplateCode: "UNIQUE",
        ruleConfig: {}, ruleLogicTypeCode: "THRESHOLD", ruleDefinitionText: null,
        thresholdJson: { metric: "unique_pct", operator: ">=", value: round(Math.max(0, uniquePct - settings.uniquenessBufferPct)), buffer: settings.uniquenessBufferPct },
        severityLevelCode: "WARNING", provenanceCode: "PROFILING",
        evidenceJson: { distinct_count: p.distinctCount, row_count: p.rowCount, observed_unique_pct: round(uniquePct), profiled_at: p.profiledAt },
      });
    }
  }

  // ── Referential integrity (orphan check) ────────────────────────────────────
  for (const fk of ctx.outboundFks) {
    drafts.push({
      dimensionCode: "CONSISTENCY", ruleNameText: `${colLabel}: referential integrity -> ${fk.refTableName}.${fk.refColumnName}`,
      ruleTemplateCode: "REFERENTIAL_CHECK", ruleConfig: { ref_table: fk.refTableName, ref_column: fk.refColumnName },
      ruleLogicTypeCode: "THRESHOLD", ruleDefinitionText: null,
      thresholdJson: { metric: "match_pct", operator: "=", value: 100 },
      severityLevelCode: "WARNING", provenanceCode: "STRUCTURE",
      evidenceJson: { fk_column: fk.columnName, ref_table: fk.refTableName, ref_column: fk.refColumnName },
    });
  }

  // ── Range check (Validity) ──────────────────────────────────────────────────
  if (isNumericType(ctx.dataType ?? "") && p?.minValue != null && p?.maxValue != null) {
    const min = Number(p.minValue), max = Number(p.maxValue);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const margin = Math.max(Math.abs(max - min) * 0.05, 1);
      drafts.push({
        dimensionCode: "VALIDITY", ruleNameText: `${colLabel}: range check`, ruleTemplateCode: "RANGE_CHECK",
        ruleConfig: { min_value: round(min - margin), max_value: round(max + margin) },
        ruleLogicTypeCode: "THRESHOLD", ruleDefinitionText: null,
        thresholdJson: { metric: "range", operator: "between", value: [round(min - margin), round(max + margin)], buffer: round(margin) },
        severityLevelCode: "INFO", provenanceCode: "PROFILING",
        evidenceJson: { observed_min: min, observed_max: max, profiled_at: p.profiledAt },
      });
    }
  }

  // ── Length check (fixed-width codes, Validity) ──────────────────────────────
  if (isTextType(ctx.dataType ?? "") && p?.minValue != null && p?.maxValue != null) {
    const minLen = String(p.minValue).length, maxLen = String(p.maxValue).length;
    if (minLen === maxLen && minLen > 0) {
      drafts.push({
        dimensionCode: "VALIDITY", ruleNameText: `${colLabel}: fixed length (${minLen})`, ruleTemplateCode: "REGEX_MATCH",
        ruleConfig: { pattern: `^.{${minLen}}$` }, ruleLogicTypeCode: "REGEX", ruleDefinitionText: null,
        thresholdJson: { metric: "length", operator: "=", value: minLen },
        severityLevelCode: "INFO", provenanceCode: "PROFILING",
        evidenceJson: { observed_min_value: p.minValue, observed_max_value: p.maxValue, profiled_at: p.profiledAt },
      });
    }
  }

  // ── Format / regex detection (name + glossary format hint) ─────────────────
  const nameHint = `${ctx.physicalName} ${ctx.friendlyName ?? ""}`;
  const formatHint = ctx.glossaryMatch?.formatText ?? "";
  const matched = FORMAT_PATTERNS.find((f) => f.test.test(nameHint) || f.test.test(formatHint));
  if (matched) {
    drafts.push({
      dimensionCode: "VALIDITY", ruleNameText: `${colLabel}: ${matched.label} format`, ruleTemplateCode: "REGEX_MATCH",
      ruleConfig: { pattern: matched.pattern }, ruleLogicTypeCode: "REGEX", ruleDefinitionText: null,
      thresholdJson: { metric: "format_match_pct", operator: ">=", value: 99 },
      severityLevelCode: "WARNING", provenanceCode: ctx.glossaryMatch?.formatText ? "GLOSSARY" : "STRUCTURE",
      evidenceJson: { detected_pattern: matched.label, source: ctx.glossaryMatch?.formatText ? "glossary format_text" : "column name" },
    });
  }

  // ── Domain / allowed-values (lookup column) ─────────────────────────────────
  if (domain && domain.values.length > 0 && domain.values.length <= 20) {
    drafts.push({
      dimensionCode: "VALIDITY", ruleNameText: `${colLabel}: allowed values (${domain.refTable})`, ruleTemplateCode: "VALUE_IN_LIST",
      ruleConfig: { allowed_values: domain.values.join(",") }, ruleLogicTypeCode: "THRESHOLD", ruleDefinitionText: null,
      thresholdJson: { metric: "in_list_pct", operator: ">=", value: 99 },
      severityLevelCode: "INFO", provenanceCode: "STRUCTURE",
      evidenceJson: { ref_table: domain.refTable, ref_column: domain.refColumn, value_count: domain.values.length },
    });
  }

  return drafts;
}

/** Table-level: row-count trend anomaly (Timeliness/Freshness). */
export function suggestTier1TableRules(ctx: ContextPackage): DqRuleDraft[] {
  const p = ctx.profiling;
  if (!p?.rowCount || !p?.prevRowCount) return [];
  const current = Number(p.rowCount), prev = Number(p.prevRowCount);
  if (prev <= 0) return [];
  const band = Math.max(1, Math.round(prev * 0.10));
  const minRows = Math.max(0, prev - band);
  return [{
    dimensionCode: "FRESHNESS", ruleNameText: `${ctx.entityName}: row count volume`, ruleTemplateCode: "ROW_COUNT_THRESHOLD",
    ruleConfig: { min_rows: minRows }, ruleLogicTypeCode: "THRESHOLD", ruleDefinitionText: null,
    thresholdJson: { metric: "row_count", operator: ">=", value: minRows, buffer: band },
    severityLevelCode: "INFO", provenanceCode: "PROFILING",
    evidenceJson: { current_row_count: current, previous_row_count: prev, profiled_at: p.profiledAt },
  }];
}
