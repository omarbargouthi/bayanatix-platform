// Sensitive Information Type (SIT) scoring engine. Mirrors lib/column-classifier.ts:
// a pure, DB-free function so it stays unit-testable and every suggestion is
// explainable to a steward via its rationale, never a black box. The caller
// (lib/sit-classification-runner.ts) assembles a ColumnSitInput from the catalog
// plus live-sampled values and a region-filtered pattern dictionary.

export type SitPatternType = "NAME_REGEX" | "VALUE_REGEX" | "CHECKSUM";
export type SitConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

export type SitPattern = {
  glossaryId: number;
  patternType: SitPatternType;
  patternText: string;
  confidenceWeight: number;
};

export type ColumnSitInput = {
  name: string;
  friendlyName: string | null;
  description: string | null;
  /** Non-null live sample values, as strings. Empty when no live connection exists —
   *  scoring then degrades to NAME_REGEX-only signals. */
  sampleValues: string[];
};

export type SitEvidenceHit = {
  patternType: SitPatternType;
  patternText: string;
  weight: number;
  matchRatio: number;
  contribution: number;
};

export type SitTermScore = {
  glossaryId: number;
  confidence: number;
  band: SitConfidenceBand;
  hits: SitEvidenceHit[];
};

export type SitSuggestion = SitTermScore & { sampledLive: boolean } | null;

// Checksum algorithms — a fixed, code-side lookup since these aren't expressible as
// a regex. SA_NATIONAL_ID is the commonly-used community-verified check-digit
// algorithm for Saudi National ID / Iqama numbers (a Luhn variant) — not an
// officially published government spec, flagged honestly rather than overstated.
const CHECKSUM_FNS: Record<string, (value: string) => boolean> = {
  LUHN: (value) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 2) return false;
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = Number(digits[i]);
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    return sum % 10 === 0;
  },
  IBAN_MOD97: (value) => {
    const iban = value.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let remainder = 0;
    for (const ch of rearranged) {
      const code = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
      for (const digit of code) {
        remainder = (remainder * 10 + Number(digit)) % 97;
      }
    }
    return remainder === 1;
  },
  SA_NATIONAL_ID: (value) => {
    const digits = value.replace(/\D/g, "");
    if (!/^[12]\d{9}$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let d = Number(digits[i]);
      if (i % 2 === 0) {
        d *= 2;
        if (d > 9) d = Math.floor(d / 10) + (d % 10);
      }
      sum += d;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === Number(digits[9]);
  },
};

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null; // an invalid regex in the dictionary must never crash a run
  }
}

// The term assignment weights (Administration › Configuration › Sensitive Information
// Types › Term Assignment Weights, bayanat.sit_settings). Nothing in the scoring below
// is a fixed number: each pattern has its own weight, and these settings scale and
// band the result.
export type SitScoringConfig = {
  /** Multiplies the weight of every pattern of that kind (1 = the pattern's own weight). */
  nameWeightFactor: number; valueWeightFactor: number; checksumWeightFactor: number;
  /** Confidence from which a suggestion is HIGH / MEDIUM. */
  highBandThreshold: number; mediumBandThreshold: number;
  /** Least weight of a name match when the table's values could not be sampled at all. */
  nameOnlyMatchWeight: number;
};
export const DEFAULT_SIT_SCORING: SitScoringConfig = {
  nameWeightFactor: 1, valueWeightFactor: 1, checksumWeightFactor: 1,
  highBandThreshold: 0.85, mediumBandThreshold: 0.5, nameOnlyMatchWeight: 0.85,
};

export function bandFor(confidence: number, cfg: Pick<SitScoringConfig, "highBandThreshold" | "mediumBandThreshold"> = DEFAULT_SIT_SCORING): SitConfidenceBand {
  return confidence >= cfg.highBandThreshold ? "HIGH" : confidence >= cfg.mediumBandThreshold ? "MEDIUM" : "LOW";
}

// nameOnlyWeight: set when the column's values could not be sampled at all (no live
// connection). A name pattern then carries at least this weight — the patterns' own
// weights (0.40 in the shipped catalog) assume a value match adds to them, which can't
// happen here, so on their own they could never reach the HIGH band.
function scoreAgainstTerm(input: ColumnSitInput, patterns: SitPattern[], cfg: SitScoringConfig, nameOnlyWeight?: number): SitTermScore {
  const glossaryId = patterns[0].glossaryId;
  const nameHaystack = [input.name, input.friendlyName, input.description].filter(Boolean).join(" ");
  const hits: SitEvidenceHit[] = [];
  let score = 0;

  for (const p of patterns) {
    if (p.patternType === "NAME_REGEX") {
      const re = safeRegex(p.patternText);
      if (re && re.test(nameHaystack)) {
        const own = p.confidenceWeight * cfg.nameWeightFactor;
        const weight = nameOnlyWeight != null ? Math.max(own, nameOnlyWeight) : own;
        score += weight;
        hits.push({ patternType: p.patternType, patternText: p.patternText, weight, matchRatio: 1, contribution: weight });
      }
      continue;
    }

    if (input.sampleValues.length === 0) continue; // VALUE_REGEX/CHECKSUM need live samples

    if (p.patternType === "VALUE_REGEX") {
      const re = safeRegex(p.patternText);
      if (!re) continue;
      const matched = input.sampleValues.filter((v) => re.test(v)).length;
      const ratio = matched / input.sampleValues.length;
      if (ratio > 0) {
        const weight = p.confidenceWeight * cfg.valueWeightFactor;
        const contribution = ratio * weight;
        score += contribution;
        hits.push({ patternType: p.patternType, patternText: p.patternText, weight, matchRatio: ratio, contribution });
      }
    } else if (p.patternType === "CHECKSUM") {
      const fn = CHECKSUM_FNS[p.patternText];
      if (!fn) continue;
      const passed = input.sampleValues.filter((v) => {
        try { return fn(v); } catch { return false; }
      }).length;
      const ratio = passed / input.sampleValues.length;
      if (ratio > 0) {
        const weight = p.confidenceWeight * cfg.checksumWeightFactor;
        const contribution = ratio * weight;
        score += contribution;
        hits.push({ patternType: p.patternType, patternText: p.patternText, weight, matchRatio: ratio, contribution });
      }
    }
  }

  const confidence = Math.round(Math.min(1, score) * 1000) / 1000;
  return { glossaryId, confidence, band: bandFor(confidence, cfg), hits };
}

// Scores a column against every candidate SIT term and returns the single
// highest-scoring one — matches the app's one-CLASSIFICATION-term-per-asset model
// (idx_abt_classification_unique). Returns null if nothing clears the threshold.
export function scoreColumnAgainstSit(
  input: ColumnSitInput,
  patternsByTerm: Map<number, SitPattern[]>,
  minConfidenceThreshold: number,
  // config: the term assignment weights. nameOnly: the table's values could not be
  // sampled, so config.nameOnlyMatchWeight applies to name matches.
  opts: { config?: SitScoringConfig; nameOnly?: boolean } = {},
): SitSuggestion {
  const cfg = opts.config ?? DEFAULT_SIT_SCORING;
  let best: SitTermScore | null = null;
  for (const patterns of patternsByTerm.values()) {
    if (patterns.length === 0) continue;
    const result = scoreAgainstTerm(input, patterns, cfg, opts.nameOnly ? cfg.nameOnlyMatchWeight : undefined);
    if (!best || result.confidence > best.confidence) best = result;
  }
  if (!best || best.confidence < minConfidenceThreshold) return null;
  return { ...best, sampledLive: input.sampleValues.length > 0 };
}
