// Saving the column type rules (db/169), restoring the default name patterns, and
// scoring the columns already in the catalog with a set of rules. The rules themselves
// are in lib/column-classifier.ts; reading the saved rules is in the runner, which
// every classification run goes through.
import { sql } from "../db";
import { runColumnClassification, getColumnTypeConfig } from "../classification-runner";
import type { ColumnTypeConfig, PatternGroup } from "../column-classifier";

export async function saveColumnTypeConfig(config: ColumnTypeConfig, userId: string): Promise<void> {
  await sql`
    INSERT INTO bayanat.column_type_rule_settings (settings_id, config_json, updated_by_user_id, updated_at)
    VALUES (1, ${sql.json(config as never)}, ${userId}, now())
    ON CONFLICT (settings_id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
  `;
}

// The name patterns shipped with the product (db/065), for "restore defaults".
export const DEFAULT_COLUMN_PATTERNS: Record<Exclude<PatternGroup, "EXCLUDE">, string[]> = {
  SURROGATE_KEY: ["_id$", "^id$", "_key$", "_sk$", "_seq$", "_uid$", "guid", "uuid"],
  AUDIT_COLUMN: ["^created_", "^updated_", "^modified_", "_timestamp$", "^row_version", "^is_deleted", "^deleted_", "^etl_", "^batch_", "^load_", "^src_sys", "^tenant_id$", "^hash_", "^rec_status"],
  NATURAL_ID: ["_no$", "_num$", "_number$", "_code$", "_ref$", "iban", "vat_no", "national_id"],
  LOOKUP_VALUE: ["_name$", "_desc$", "_description$", "_label$", "_value$", "_text$", "name_(en|ar)$"],
};

/**
 * Puts back any default pattern that was deleted and switches on any that was switched
 * off. Patterns an administrator added are left as they are.
 */
export async function restoreDefaultColumnPatterns(): Promise<{ added: number; enabled: number }> {
  let added = 0, enabled = 0;
  for (const [group, regexes] of Object.entries(DEFAULT_COLUMN_PATTERNS)) {
    for (const regex of regexes) {
      const [existing] = await sql<{ id: number; enabled: boolean }[]>`
        SELECT pattern_id AS id, is_enabled_indicator AS enabled FROM bayanat.classification_patterns
        WHERE pattern_group_code = ${group} AND pattern_regex_text = ${regex} AND data_source_id IS NULL
      `;
      if (!existing) {
        await sql`INSERT INTO bayanat.classification_patterns (pattern_group_code, pattern_regex_text, data_source_id) VALUES (${group}, ${regex}, NULL)`;
        added++;
      } else if (!existing.enabled) {
        await sql`UPDATE bayanat.classification_patterns SET is_enabled_indicator = true WHERE pattern_id = ${existing.id}`;
        enabled++;
      }
    }
  }
  return { added, enabled };
}

export type ColumnRescoreChange = {
  attributeId: number; source: string; table: string; column: string;
  fromClass: string; fromBand: string; toClass: string; toBand: string; toConfidence: number; rule: string;
};
export type ColumnRescoreResult = {
  evaluated: number;
  /** Columns whose suggested type changes. */
  suggestionChanged: number;
  /** Preview only: same type, different confidence band. */
  bandChanged: number;
  /** Preview only: columns with a steward-confirmed type the rules disagree with. */
  confirmedDisagree: number;
  /** Preview only: columns that have no suggestion yet and would get one. */
  neverScored: number;
  changes: ColumnRescoreChange[];
};

/**
 * Scores every column in the catalog, one data source at a time so each source's own
 * pattern exceptions apply.
 *
 * Preview (`apply` false): nothing is written. Each column is scored twice, with the
 * saved rules and with the rules given, and the result is the difference between the
 * two — so it shows the effect of the edits on screen and nothing else.
 *
 * Apply: an ordinary classification run over every source with the saved rules. A
 * column whose type a steward confirmed keeps it, and is flagged for review when the
 * rules now disagree.
 */
export async function rescoreColumnTypes(opts: { config?: ColumnTypeConfig; apply: boolean; userId: string }): Promise<ColumnRescoreResult> {
  const sources = await sql<{ id: number; name: string }[]>`SELECT data_source_id AS id, source_name_text AS name FROM bayanat.data_sources ORDER BY source_name_text`;
  const out: ColumnRescoreResult = { evaluated: 0, suggestionChanged: 0, bandChanged: 0, confirmedDisagree: 0, neverScored: 0, changes: [] };
  const savedConfig = await getColumnTypeConfig();
  for (const src of sources) {
    const base = { scopeType: "DATA_SOURCE" as const, scopeId: Number(src.id), scopeMode: "ALL" as const, triggeredByUserId: opts.userId, autoAcceptBand: "NONE" as const };
    if (opts.apply) {
      const r = await runColumnClassification(base);
      out.evaluated += r.attributesEvaluated;
      out.suggestionChanged += r.suggestionsChanged;
      continue;
    }
    const before = await runColumnClassification({ ...base, dryRun: true, config: savedConfig });
    const after = opts.config ? await runColumnClassification({ ...base, dryRun: true, config: opts.config }) : before;
    const beforeById = new Map((before.scored ?? []).map((r) => [r.attributeId, r]));
    for (const a of after.scored ?? []) {
      out.evaluated++;
      if (a.storedSuggestion == null) out.neverScored++;
      if (a.confirmedClass != null && a.confirmedClass !== a.suggestedClass) out.confirmedDisagree++;
      const b = beforeById.get(a.attributeId);
      if (!b) continue;
      if (b.suggestedClass !== a.suggestedClass) {
        out.suggestionChanged++;
        out.changes.push({
          attributeId: a.attributeId, source: src.name, table: a.table, column: a.column,
          fromClass: b.suggestedClass, fromBand: b.band, toClass: a.suggestedClass, toBand: a.band, toConfidence: a.confidence, rule: a.rule,
        });
      } else if (b.band !== a.band) out.bandChanged++;
    }
  }
  return out;
}
