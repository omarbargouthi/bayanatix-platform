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

// ── Configuration (Configuration > Column Type Rules, db/169) ─────────────────
// The confidence each rule gives, the modifiers applied afterwards, the confidence
// bands and the hints that mark a surrogate key are settings. The name patterns are
// settings too, in bayanat.classification_patterns. Each rule can also be switched off,
// in which case it is skipped and the column falls through to the rules below it. What
// is NOT a setting is the order the rules are tried in and the decision each one gives:
// R0–R11 are a decision list where each rule assumes the earlier ones did not match, so
// reordering them would change what the later rules mean. R11 is the catch-all and
// cannot be switched off — every column has to end somewhere.

export type RuleKey =
  | "R0" | "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7_REFERENCED" | "R7_UNREFERENCED" | "R8" | "R9" | "R10" | "R11";
export const RULE_KEYS: RuleKey[] = ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7_REFERENCED", "R7_UNREFERENCED", "R8", "R9", "R10", "R11"];

export type ColumnTypeConfig = {
  /** Confidence (0–1) of the suggestion when this rule is the one that decides. */
  ruleConfidence: Record<RuleKey, number>;
  /** false = the rule is skipped. R11 (the catch-all) is always on. */
  ruleEnabled: Record<RuleKey, boolean>;
  modifiers: {
    nameInferredFactor: number;  // multiplies the confidence when the FK behind R3/R5/R6 was only inferred from names
    noCategoryCap: number;       // highest confidence while the table has no table type
    glossaryFloor: number;       // lowest confidence when the column matches a glossary term (forces Business)
    governedFloor: number;       // lowest confidence when the column already has DQ rules or a classification (forces Business)
  };
  bands: { high: number; medium: number };
  /** A column looks like a surrogate key when its data type / default value contains one of these. */
  surrogateHints: { dataTypes: string[]; defaults: string[] };
};

export const DEFAULT_COLUMN_TYPE_CONFIG: ColumnTypeConfig = {
  ruleConfidence: {
    R0: 0.97, R1: 0.98, R2: 0.95, R3: 0.92, R4: 0.88, R5: 0.90, R6: 0.93,
    R7_REFERENCED: 0.70, R7_UNREFERENCED: 0.60, R8: 0.85, R9: 0.90, R10: 0.65, R11: 0.40,
  },
  ruleEnabled: {
    R0: true, R1: true, R2: true, R3: true, R4: true, R5: true, R6: true,
    R7_REFERENCED: true, R7_UNREFERENCED: true, R8: true, R9: true, R10: true, R11: true,
  },
  modifiers: { nameInferredFactor: 0.85, noCategoryCap: 0.50, glossaryFloor: 0.95, governedFloor: 0.95 },
  bands: { high: 0.90, medium: 0.70 },
  surrogateHints: { dataTypes: ["serial", "identity", "uuid"], defaults: ["nextval", "identity", "autoincrement", "auto_increment"] },
};

/** Fills anything missing from a stored configuration with the default. */
export function withColumnTypeDefaults(stored: unknown): ColumnTypeConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<ColumnTypeConfig>;
  const d = DEFAULT_COLUMN_TYPE_CONFIG;
  const list = (v: unknown, def: string[]) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : def);
  return {
    ruleConfidence: { ...d.ruleConfidence, ...(s.ruleConfidence ?? {}) },
    ruleEnabled: { ...d.ruleEnabled, ...(s.ruleEnabled ?? {}), R11: true },
    modifiers: { ...d.modifiers, ...(s.modifiers ?? {}) },
    bands: { ...d.bands, ...(s.bands ?? {}) },
    surrogateHints: { dataTypes: list(s.surrogateHints?.dataTypes, d.surrogateHints.dataTypes), defaults: list(s.surrogateHints?.defaults, d.surrogateHints.defaults) },
  };
}

/** Checks a configuration sent by the screen; returns it cleaned or the reason it cannot be saved. */
export function validateColumnTypeConfig(input: unknown): { config: ColumnTypeConfig } | { error: string } {
  const c = withColumnTypeDefaults(input);
  const unit = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  const ruleConfidence = {} as Record<RuleKey, number>;
  for (const key of RULE_KEYS) {
    if (!unit(c.ruleConfidence[key])) return { error: `Confidence must be between 0 and 1 (${key} is ${c.ruleConfidence[key]}).` };
    ruleConfidence[key] = c.ruleConfidence[key];
  }
  const ruleEnabled = {} as Record<RuleKey, boolean>;
  for (const key of RULE_KEYS) {
    if (typeof c.ruleEnabled[key] !== "boolean") return { error: `A rule is either on or off (${key}).` };
    ruleEnabled[key] = c.ruleEnabled[key];
  }
  if ((input as Partial<ColumnTypeConfig> | null)?.ruleEnabled?.R11 === false) return { error: "The last rule is the catch-all and cannot be switched off." };
  const m = c.modifiers;
  for (const [key, v] of Object.entries({ nameInferredFactor: m.nameInferredFactor, noCategoryCap: m.noCategoryCap, glossaryFloor: m.glossaryFloor, governedFloor: m.governedFloor })) {
    if (!unit(v)) return { error: `Modifiers must be between 0 and 1 (${key} is ${v}).` };
  }
  if (!unit(c.bands.high) || !unit(c.bands.medium)) return { error: "The confidence bands must be between 0 and 1." };
  if (c.bands.medium > c.bands.high) return { error: "The Medium band cannot start above the High band." };
  const clean = (items: string[]) => Array.from(new Set(items.map((k) => k.trim().toLowerCase()).filter(Boolean)));
  const dataTypes = clean(c.surrogateHints.dataTypes), defaults = clean(c.surrogateHints.defaults);
  if ([...dataTypes, ...defaults].some((k) => k.length > 60)) return { error: "A hint can be at most 60 characters." };
  if (dataTypes.length > 50 || defaults.length > 50) return { error: "A hint list can have at most 50 entries." };
  return {
    config: {
      ruleConfidence,
      ruleEnabled,
      modifiers: { nameInferredFactor: m.nameInferredFactor, noCategoryCap: m.noCategoryCap, glossaryFloor: m.glossaryFloor, governedFloor: m.governedFloor },
      bands: { high: c.bands.high, medium: c.bands.medium },
      surrogateHints: { dataTypes, defaults },
    },
  };
}

function matches(name: string, group: PatternGroup, patterns: PatternDictionary): boolean {
  return (patterns[group] ?? []).some((re) => re.test(name));
}

export function isSurrogateLooking(
  col: { name: string; dataType: string; defaultValueText: string | null }, patterns: PatternDictionary,
  cfg: ColumnTypeConfig = DEFAULT_COLUMN_TYPE_CONFIG,
): boolean {
  const nameMatch = matches(col.name, "SURROGATE_KEY", patterns);
  const dataType = col.dataType.toLowerCase();
  const typeMatch = cfg.surrogateHints.dataTypes.some((h) => h && dataType.includes(h));
  const def = col.defaultValueText?.toLowerCase() ?? "";
  const seqDefault = !!def && cfg.surrogateHints.defaults.some((h) => h && def.includes(h));
  return nameMatch || typeMatch || seqDefault;
}

export function bandFor(confidence: number, cfg: ColumnTypeConfig = DEFAULT_COLUMN_TYPE_CONFIG): ConfidenceBand {
  return confidence >= cfg.bands.high ? "HIGH" : confidence >= cfg.bands.medium ? "MEDIUM" : "LOW";
}

export function classifyColumn(input: ColumnInput, patterns: PatternDictionary, cfg: ColumnTypeConfig = DEFAULT_COLUMN_TYPE_CONFIG): ClassificationResult {
  const rc = cfg.ruleConfidence, on = cfg.ruleEnabled, mod = cfg.modifiers;
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
  if (on.R0 && matches(name, "EXCLUDE", patterns)) {
    rule = "R0"; decision = "TECHNICAL"; confidence = rc.R0;
    hits.push({ rule, detail: "name matches a steward-defined EXCLUDE pattern exception" });
    signals.name_pattern_group = "EXCLUDE";

  // ── R1–R11, evaluated strictly in priority order — first match wins. ──────────
  } else if (on.R1 && matches(name, "AUDIT_COLUMN", patterns)) {
    rule = "R1"; decision = "TECHNICAL"; confidence = rc.R1;
    hits.push({ rule, detail: `name matches AUDIT_COLUMN pattern` });
    signals.name_pattern_group = "AUDIT_COLUMN";

  } else if (on.R2 && input.isPrimaryKey && input.entity.pkColumnCount === 1 && isSurrogateLooking(input, patterns, cfg)) {
    rule = "R2"; decision = "TECHNICAL"; confidence = rc.R2;
    hits.push({ rule, detail: "single-column PK, surrogate-looking (name/type/sequence default)" });
    signals.name_pattern_group = matches(name, "SURROGATE_KEY", patterns) ? "SURROGATE_KEY" : undefined;

  } else if (on.R3 && input.isForeignKey && input.referencedColumn?.isSurrogatePk) {
    rule = "R3"; decision = "TECHNICAL"; confidence = rc.R3;
    hits.push({ rule, detail: `FK to a surrogate PK (${input.referencedColumn.discoveryMethod})` });
    signals.fk_discovery_method = input.referencedColumn.discoveryMethod;

  } else if (on.R4 && matches(name, "NATURAL_ID", patterns) && !matches(name, "SURROGATE_KEY", patterns)) {
    rule = "R4"; decision = "BUSINESS"; confidence = rc.R4;
    hits.push({ rule, detail: "name matches NATURAL_ID pattern" });
    signals.name_pattern_group = "NATURAL_ID";

  } else if (
    on.R5 && category === "REFERENCE" && input.entity.referencedByMasterOrTransactional && nonKey &&
    (matches(name, "LOOKUP_VALUE", patterns) || input.entity.pkColumnCount === 0)
  ) {
    rule = "R5"; decision = "BUSINESS"; confidence = rc.R5;
    hits.push({ rule, detail: "non-key column on a referenced lookup table" });
    signals.name_pattern_group = matches(name, "LOOKUP_VALUE", patterns) ? "LOOKUP_VALUE" : undefined;

  } else if (on.R6 && category === "REFERENCE" && (input.isPrimaryKey || input.isForeignKey)) {
    rule = "R6"; decision = "TECHNICAL"; confidence = rc.R6;
    hits.push({ rule, detail: "internal key column on a lookup/reference table" });

  } else if (category === "REFERENCE" && nonKey && (input.entity.referencedByMasterOrTransactional ? on.R7_REFERENCED : on.R7_UNREFERENCED)) {
    // A REFERENCE table is, by category, a business-nature lookup — the internal/
    // technical case already has its own category (SETUP/SYSTEM, see R8 below).
    // No inbound Master/Transactional FK just means the topology can't *confirm*
    // usage (missing constraints, flat-file source, a name-inference miss) — it
    // doesn't make a descriptive column technical. Confidence stays below HIGH
    // either way so a steward still reviews these.
    rule = "R7"; decision = "BUSINESS";
    confidence = input.entity.referencedByMasterOrTransactional ? rc.R7_REFERENCED : rc.R7_UNREFERENCED;
    hits.push({
      rule,
      detail: input.entity.referencedByMasterOrTransactional
        ? "descriptive column on a referenced lookup table, no specific lookup-value pattern matched — steward review recommended"
        : "descriptive column on an unreferenced lookup table — lookup nature presumed business; steward review recommended",
    });

  } else if (on.R8 && (category === "SETUP" || category === "SYSTEM")) {
    rule = "R8"; decision = "TECHNICAL"; confidence = rc.R8;
    hits.push({ rule, detail: `entity category is ${category}` });

  } else if (on.R9 && (category === "MASTER" || category === "TRANSACTIONAL") && nonKey) {
    rule = "R9"; decision = "BUSINESS"; confidence = rc.R9;
    hits.push({ rule, detail: `non-key column on a ${category} table` });

  } else if (on.R10 && input.isPrimaryKey && input.entity.pkColumnCount > 1 && !matches(name, "SURROGATE_KEY", patterns)) {
    rule = "R10"; decision = "BUSINESS"; confidence = rc.R10;
    hits.push({ rule, detail: "member of a composite natural primary key — steward review" });

  } else {
    rule = "R11"; decision = "BUSINESS"; confidence = rc.R11;
    hits.push({ rule, detail: "no rule matched (e.g. entity category unknown)" });
  }

  // ── Modifiers, applied after the terminal rule ─────────────────────────────────
  // Order matters and isn't fully pinned down by the spec; this implementation applies
  // the NAME_INFERRED discount and the null-category cap to the terminal-rule confidence
  // first, then lets the two "force BUSINESS" modifiers (glossary / governance signals)
  // override on top — direct evidence that someone already governs this column should
  // win over generic uncertainty, not get suppressed by it.
  if ((rule === "R3" || rule === "R5" || rule === "R6") && input.referencedColumn?.discoveryMethod === "NAME_INFERRED") {
    confidence *= mod.nameInferredFactor;
    hits.push({ rule: "MOD_NAME_INFERRED", detail: `FK used to reach this decision was name-inferred, not introspected — confidence discounted ×${mod.nameInferredFactor}` });
  }

  if (category == null) {
    const capped = Math.min(confidence, mod.noCategoryCap);
    if (capped < confidence) hits.push({ rule: "MOD_NO_CATEGORY", detail: `entity has no table-type category — confidence capped at ${mod.noCategoryCap.toFixed(2)}; categorize the table first` });
    confidence = capped;
  }

  if (input.hasGlossaryMatch) {
    decision = "BUSINESS";
    confidence = Math.max(confidence, mod.glossaryFloor);
    hits.push({ rule: "MOD_GLOSSARY", detail: `matched business glossary term${input.glossaryTermName ? ` "${input.glossaryTermName}"` : ""} — forces BUSINESS` });
  } else if (rule !== "R11") {
    hits.push({ rule: "MOD_GLOSSARY", detail: "no glossary match" });
  }

  if (input.hasGovernanceSignals) {
    decision = "BUSINESS";
    confidence = Math.max(confidence, mod.governedFloor);
    hits.push({ rule: "MOD_GOVERNED", detail: "already has DQ rules or a classification/PI tag — forces BUSINESS" });
  }

  confidence = Math.round(confidence * 1000) / 1000;

  return {
    suggestedClass: decision,
    confidence,
    band: bandFor(confidence, cfg),
    rationale: { terminal_rule: rule, decision, confidence, hits, signals },
  };
}
