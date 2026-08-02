// Column Asset-Type Suggestion engine (Business vs Technical).
// See "Bayanatix - Column Asset Type Suggestion Feature Spec.md" §3 for the full rule
// table. Deliberately a pure, DB-free function — the caller assembles a ColumnInput
// from the catalog (lib/classification-runner.ts) so this module stays unit-testable
// and the rules stay transparent/explainable, per the spec's non-functional requirement
// that every suggestion must be explainable to a steward, never a black box.

export type ClassCode = "BUSINESS" | "TECHNICAL";
export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";
export type PatternGroup = "SURROGATE_KEY" | "AUDIT_COLUMN" | "NATURAL_ID" | "LOOKUP_VALUE" | "EXCLUDE";
export type DiscoveryMethod = "INTROSPECTED" | "NAME_INFERRED" | "MANUAL";

export type PatternDictionary = Partial<Record<PatternGroup, RegExp[]>>;

export type ReferencedColumnInfo = {
  isSurrogatePk: boolean;
  discoveryMethod: DiscoveryMethod;
};

export type ColumnInput = {
  name: string;
  dataType: string;
  defaultValueText: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  entity: {
    categoryCode: string | null;
    pkColumnCount: number;
    /** REFERENCE-entity only: is this table referenced by >=1 MASTER/TRANSACTIONAL FK? */
    referencedByMasterOrTransactional: boolean;
  };
  /** Populated when isForeignKey — info about the column this FK points to. */
  referencedColumn: ReferencedColumnInfo | null;
  hasGlossaryMatch: boolean;
  glossaryTermName?: string | null;
  /** Has active DQ rules, or a classification/PI tag already assigned. */
  hasGovernanceSignals: boolean;
};

export type RuleHit = { rule: string; detail: string };

export type ClassificationResult = {
  suggestedClass: ClassCode;
  confidence: number;
  band: ConfidenceBand;
  rationale: {
    terminal_rule: string;
    decision: ClassCode;
    confidence: number;
    hits: RuleHit[];
    signals: Record<string, unknown>;
  };
};

function matches(name: string, group: PatternGroup, patterns: PatternDictionary): boolean {
  return (patterns[group] ?? []).some((re) => re.test(name));
}

const SURROGATE_TYPE_HINTS = ["serial", "identity", "uuid"];

export function isSurrogateLooking(col: { name: string; dataType: string; defaultValueText: string | null }, patterns: PatternDictionary): boolean {
  const nameMatch = matches(col.name, "SURROGATE_KEY", patterns);
  const typeMatch = SURROGATE_TYPE_HINTS.some((h) => col.dataType.toLowerCase().includes(h));
  const seqDefault = !!col.defaultValueText && /nextval|identity|autoincrement|auto_increment/i.test(col.defaultValueText);
  return nameMatch || typeMatch || seqDefault;
}

export function bandFor(confidence: number): ConfidenceBand {
  return confidence >= 0.90 ? "HIGH" : confidence >= 0.70 ? "MEDIUM" : "LOW";
}

export function classifyColumn(input: ColumnInput, patterns: PatternDictionary): ClassificationResult {
  const name = input.name.toLowerCase();
  const nonKey = !input.isPrimaryKey && !input.isForeignKey;
  const category = input.entity.categoryCode;
  const hits: RuleHit[] = [];
  const signals: Record<string, unknown> = {
    entity_category: category,
    is_pk: input.isPrimaryKey,
    is_fk: input.isForeignKey,
    inbound_fk_referenced: input.entity.referencedByMasterOrTransactional,
  };

  let rule: string;
  let decision: ClassCode;
  let confidence: number;

  // ── R0 (steward-authored exception, checked before every rule) ─────────────────
  // Written by the "add pattern exception" one-click action on an override (spec §5):
  // a steward already decided a specific name in this data source is TECHNICAL
  // despite how it looks structurally (e.g. an ETL artifact named like a natural id).
  // Never auto-learned — only ever created by an explicit steward action.
  if (matches(name, "EXCLUDE", patterns)) {
    rule = "R0"; decision = "TECHNICAL"; confidence = 0.97;
    hits.push({ rule, detail: "name matches a steward-defined EXCLUDE pattern exception" });
    signals.name_pattern_group = "EXCLUDE";

  // ── R1–R11, evaluated strictly in priority order — first match wins. ──────────
  } else if (matches(name, "AUDIT_COLUMN", patterns)) {
    rule = "R1"; decision = "TECHNICAL"; confidence = 0.98;
    hits.push({ rule, detail: `name matches AUDIT_COLUMN pattern` });
    signals.name_pattern_group = "AUDIT_COLUMN";

  } else if (input.isPrimaryKey && input.entity.pkColumnCount === 1 && isSurrogateLooking(input, patterns)) {
    rule = "R2"; decision = "TECHNICAL"; confidence = 0.95;
    hits.push({ rule, detail: "single-column PK, surrogate-looking (name/type/sequence default)" });
    signals.name_pattern_group = matches(name, "SURROGATE_KEY", patterns) ? "SURROGATE_KEY" : undefined;

  } else if (input.isForeignKey && input.referencedColumn?.isSurrogatePk) {
    rule = "R3"; decision = "TECHNICAL"; confidence = 0.92;
    hits.push({ rule, detail: `FK to a surrogate PK (${input.referencedColumn.discoveryMethod})` });
    signals.fk_discovery_method = input.referencedColumn.discoveryMethod;

  } else if (matches(name, "NATURAL_ID", patterns) && !matches(name, "SURROGATE_KEY", patterns)) {
    rule = "R4"; decision = "BUSINESS"; confidence = 0.88;
    hits.push({ rule, detail: "name matches NATURAL_ID pattern" });
    signals.name_pattern_group = "NATURAL_ID";

  } else if (
    category === "REFERENCE" && input.entity.referencedByMasterOrTransactional && nonKey &&
    (matches(name, "LOOKUP_VALUE", patterns) || input.entity.pkColumnCount === 0)
  ) {
    rule = "R5"; decision = "BUSINESS"; confidence = 0.90;
    hits.push({ rule, detail: "non-key column on a referenced lookup table" });
    signals.name_pattern_group = matches(name, "LOOKUP_VALUE", patterns) ? "LOOKUP_VALUE" : undefined;

  } else if (category === "REFERENCE" && (input.isPrimaryKey || input.isForeignKey)) {
    rule = "R6"; decision = "TECHNICAL"; confidence = 0.93;
    hits.push({ rule, detail: "internal key column on a lookup/reference table" });

  } else if (category === "REFERENCE" && nonKey) {
    // A REFERENCE table is, by category, a business-nature lookup — the internal/
    // technical case already has its own category (SETUP/SYSTEM, see R8 below).
    // No inbound Master/Transactional FK just means the topology can't *confirm*
    // usage (missing constraints, flat-file source, a name-inference miss) — it
    // doesn't make a descriptive column technical. Confidence stays below HIGH
    // either way so a steward still reviews these.
    rule = "R7"; decision = "BUSINESS";
    confidence = input.entity.referencedByMasterOrTransactional ? 0.70 : 0.60;
    hits.push({
      rule,
      detail: input.entity.referencedByMasterOrTransactional
        ? "descriptive column on a referenced lookup table, no specific lookup-value pattern matched — steward review recommended"
        : "descriptive column on an unreferenced lookup table — lookup nature presumed business; steward review recommended",
    });

  } else if (category === "SETUP" || category === "SYSTEM") {
    rule = "R8"; decision = "TECHNICAL"; confidence = 0.85;
    hits.push({ rule, detail: `entity category is ${category}` });

  } else if ((category === "MASTER" || category === "TRANSACTIONAL") && nonKey) {
    rule = "R9"; decision = "BUSINESS"; confidence = 0.90;
    hits.push({ rule, detail: `non-key column on a ${category} table` });

  } else if (input.isPrimaryKey && input.entity.pkColumnCount > 1 && !matches(name, "SURROGATE_KEY", patterns)) {
    rule = "R10"; decision = "BUSINESS"; confidence = 0.65;
    hits.push({ rule, detail: "member of a composite natural primary key — steward review" });

  } else {
    rule = "R11"; decision = "BUSINESS"; confidence = 0.40;
    hits.push({ rule, detail: "no rule matched (e.g. entity category unknown)" });
  }

  // ── Modifiers, applied after the terminal rule ─────────────────────────────────
  // Order matters and isn't fully pinned down by the spec; this implementation applies
  // the NAME_INFERRED discount and the null-category cap to the terminal-rule confidence
  // first, then lets the two "force BUSINESS" modifiers (glossary / governance signals)
  // override on top — direct evidence that someone already governs this column should
  // win over generic uncertainty, not get suppressed by it.
  if ((rule === "R3" || rule === "R5" || rule === "R6") && input.referencedColumn?.discoveryMethod === "NAME_INFERRED") {
    confidence *= 0.85;
    hits.push({ rule: "MOD_NAME_INFERRED", detail: "FK used to reach this decision was name-inferred, not introspected — confidence discounted ×0.85" });
  }

  if (category == null) {
    const capped = Math.min(confidence, 0.50);
    if (capped < confidence) hits.push({ rule: "MOD_NO_CATEGORY", detail: "entity has no table-type category — confidence capped at 0.50; categorize the table first" });
    confidence = capped;
  }

  if (input.hasGlossaryMatch) {
    decision = "BUSINESS";
    confidence = Math.max(confidence, 0.95);
    hits.push({ rule: "MOD_GLOSSARY", detail: `matched business glossary term${input.glossaryTermName ? ` "${input.glossaryTermName}"` : ""} — forces BUSINESS` });
  } else if (rule !== "R11") {
    hits.push({ rule: "MOD_GLOSSARY", detail: "no glossary match" });
  }

  if (input.hasGovernanceSignals) {
    decision = "BUSINESS";
    confidence = Math.max(confidence, 0.95);
    hits.push({ rule: "MOD_GOVERNED", detail: "already has DQ rules or a classification/PI tag — forces BUSINESS" });
  }

  confidence = Math.round(confidence * 1000) / 1000;

  return {
    suggestedClass: decision,
    confidence,
    band: bandFor(confidence),
    rationale: { terminal_rule: rule, decision, confidence, hits, signals },
  };
}
