// Language Management — languages CRUD + self-selection policy (spec FR-1, FR-4.4).
// Policy settings reuse bayanat.system_config's existing key/value table rather than
// a new single-row table — same pattern the old secondary-language setting used.

import { sql } from "../db";
import { logCreate, logUpdate } from "../audit";

export type Language = {
  languageCode: string;
  languageNameText: string;
  orientationCode: "LTR" | "RTL";
  isEnabled: boolean;
  isDefault: boolean;
  coveragePct: number | null;
};

const LANG_COLS = `
  l.language_code AS "languageCode", l.language_name_text AS "languageNameText",
  l.orientation_code AS "orientationCode", l.is_enabled_indicator AS "isEnabled", l.is_default_indicator AS "isDefault"
`;

export async function getLanguages(includeDisabled = true): Promise<Language[]> {
  const rows = await sql<Omit<Language, "coveragePct">[]>`
    SELECT ${sql.unsafe(LANG_COLS)}
    FROM bayanat.languages l
    ${includeDisabled ? sql`` : sql`WHERE l.is_enabled_indicator = true`}
    ORDER BY l.is_default_indicator DESC, l.language_name_text
  `;
  if (rows.length === 0) return [];

  // Grouped by the cross-joined l2.language_code (always non-null), not t.language_code
  // (null whenever no translation row exists) — grouping by the latter would collapse
  // every "no translation yet" row across every language into one indistinguishable
  // NULL bucket and silently drop it from the denominator, inflating percentages.
  // Each key's own base language is excluded — it doesn't need a translation into
  // itself (matters once base_language_code varies, e.g. Arabic-native compliance
  // content needing English coverage instead of the other way around).
  const coverage = await sql<{ languageCode: string; pct: number }[]>`
    SELECT l2.language_code AS "languageCode",
           round(100.0 * count(*) FILTER (WHERE t.status_code IN ('AI_TRANSLATED','HUMAN_EDITED','VERIFIED')) / NULLIF(count(*), 0), 1) AS pct
    FROM bayanat.translation_keys tk
    CROSS JOIN bayanat.languages l2
    LEFT JOIN bayanat.translations t ON t.key_id = tk.key_id AND t.language_code = l2.language_code
    WHERE tk.is_active_indicator = true AND l2.language_code <> tk.base_language_code
    GROUP BY l2.language_code
  `;
  const byCode = new Map(coverage.map((c) => [c.languageCode, Number(c.pct)]));
  // No applicable keys for this language (e.g. nothing needs translating into it yet) = trivially fully covered.
  return rows.map((r) => ({ ...r, coveragePct: byCode.get(r.languageCode) ?? 100 }));
}

export async function getLanguageByCode(code: string): Promise<Language | null> {
  const [row] = await sql<Omit<Language, "coveragePct">[]>`
    SELECT ${sql.unsafe(LANG_COLS)} FROM bayanat.languages l WHERE l.language_code = ${code}
  `;
  return row ? { ...row, coveragePct: null } : null;
}

export async function createLanguage(
  data: { languageCode: string; languageNameText: string; orientationCode: "LTR" | "RTL" },
  userId: string
): Promise<void> {
  await sql`
    INSERT INTO bayanat.languages (language_code, language_name_text, orientation_code, is_enabled_indicator, is_default_indicator)
    VALUES (${data.languageCode}, ${data.languageNameText}, ${data.orientationCode}, false, false)
  `;
  await logCreate("LANGUAGES", 0, userId, [
    { field: "language_code", newVal: data.languageCode },
    { field: "language_name_text", newVal: data.languageNameText },
    { field: "orientation_code", newVal: data.orientationCode },
  ]);
}

export async function updateLanguage(
  code: string,
  patch: Partial<{ languageNameText: string; orientationCode: "LTR" | "RTL"; isEnabled: boolean }>,
  userId: string
): Promise<void> {
  const before = await getLanguageByCode(code);
  if (!before) throw new Error("Language not found");

  await sql`
    UPDATE bayanat.languages SET
      language_name_text = coalesce(${patch.languageNameText ?? null}, language_name_text),
      orientation_code    = coalesce(${patch.orientationCode ?? null}, orientation_code),
      is_enabled_indicator = coalesce(${patch.isEnabled ?? null}, is_enabled_indicator),
      updated_at = NOW()
    WHERE language_code = ${code}
  `;
  await logUpdate("LANGUAGES", 0, userId, [
    { field: "language_name_text", oldVal: before.languageNameText, newVal: patch.languageNameText ?? before.languageNameText },
    { field: "is_enabled_indicator", oldVal: String(before.isEnabled), newVal: String(patch.isEnabled ?? before.isEnabled) },
  ]);
}

/** Exactly one default, same atomic pattern as llm-providers.ts's setDefaultProfile. */
export async function setDefaultLanguage(code: string, userId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`UPDATE bayanat.languages SET is_default_indicator = false WHERE is_default_indicator = true`;
    await tx`UPDATE bayanat.languages SET is_default_indicator = true, is_enabled_indicator = true WHERE language_code = ${code}`;
  });
  await logUpdate("LANGUAGES", 0, userId, [{ field: "is_default_indicator", oldVal: null, newVal: code, force: true }]);
}

// ── Self-selection policy (FR-1.4, FR-4.4) ──────────────────────────────────────

const POLICY_KEYS = {
  enabled: "language_self_selection_enabled",
  choosable: "language_choosable_codes",
  threshold: "language_coverage_threshold_pct",
} as const;

export type LanguagePolicy = { selfSelectionEnabled: boolean; choosableCodes: string[] | null; coverageThresholdPct: number };

export async function getLanguagePolicy(): Promise<LanguagePolicy> {
  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM bayanat.system_config WHERE key = ANY(${Object.values(POLICY_KEYS)})
  `;
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const choosable = byKey.get(POLICY_KEYS.choosable);
  return {
    selfSelectionEnabled: (byKey.get(POLICY_KEYS.enabled) ?? "true") === "true",
    choosableCodes: choosable && choosable.trim() ? choosable.split(",").map((c) => c.trim()) : null,
    coverageThresholdPct: Number(byKey.get(POLICY_KEYS.threshold) ?? "95"),
  };
}

export async function updateLanguagePolicy(patch: Partial<LanguagePolicy>, userId: string): Promise<void> {
  const entries: [string, string][] = [];
  if (patch.selfSelectionEnabled !== undefined) entries.push([POLICY_KEYS.enabled, String(patch.selfSelectionEnabled)]);
  if (patch.choosableCodes !== undefined) entries.push([POLICY_KEYS.choosable, patch.choosableCodes?.join(",") ?? ""]);
  if (patch.coverageThresholdPct !== undefined) entries.push([POLICY_KEYS.threshold, String(patch.coverageThresholdPct)]);

  for (const [key, value] of entries) {
    await sql`
      INSERT INTO bayanat.system_config (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }
  if (entries.length > 0) {
    await logUpdate("LANGUAGE_POLICY", 0, userId, entries.map(([field, newVal]) => ({ field, oldVal: null, newVal, force: true })));
  }
}
