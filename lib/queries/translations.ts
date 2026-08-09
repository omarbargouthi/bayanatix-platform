// Language Management — translation workbench + coverage grid (spec FR-2). A
// language's coverage is derived, not stored: a key with no bayanat.translations row
// for that language is implicitly MISSING (there's no need to pre-insert a MISSING
// row per key per language — that would mean writing ~1450 rows for every language
// added, for no benefit).

import { sql } from "../db";
import { logUpdate } from "../audit";

export type CategoryCoverageRow = {
  categoryCode: string;
  categoryNameText: string;
  domainCode: string;
  languageCode: string;
  totalKeys: number;
  missing: number;
  aiTranslated: number;
  humanEdited: number;
  verified: number;
  stale: number;
  coveredPct: number;
};

/** One row per (category, non-English enabled-or-not language) — grid cells for the admin UI. */
export async function getCategoryCoverage(): Promise<CategoryCoverageRow[]> {
  const rows = await sql<Omit<CategoryCoverageRow, "coveredPct">[]>`
    SELECT
      tc.category_code AS "categoryCode", tc.category_name_text AS "categoryNameText", tc.domain_code AS "domainCode",
      l.language_code AS "languageCode",
      count(tk.key_id)::int AS "totalKeys",
      count(*) FILTER (WHERE t.status_code IS NULL)::int AS "missing",
      count(*) FILTER (WHERE t.status_code = 'AI_TRANSLATED')::int AS "aiTranslated",
      count(*) FILTER (WHERE t.status_code = 'HUMAN_EDITED')::int AS "humanEdited",
      count(*) FILTER (WHERE t.status_code = 'VERIFIED')::int AS "verified",
      count(*) FILTER (WHERE t.status_code = 'STALE')::int AS "stale"
    FROM bayanat.translation_categories tc
    CROSS JOIN bayanat.languages l
    LEFT JOIN bayanat.translation_keys tk ON tk.category_code = tc.category_code AND tk.is_active_indicator = true
    LEFT JOIN bayanat.translations t ON t.key_id = tk.key_id AND t.language_code = l.language_code
    WHERE tk.key_id IS NULL OR l.language_code <> tk.base_language_code
    GROUP BY tc.category_code, tc.category_name_text, tc.domain_code, l.language_code
    ORDER BY tc.domain_code, tc.category_code, l.language_code
  `;
  return rows.map((r) => ({
    ...r,
    coveredPct: r.totalKeys === 0 ? 100 : Math.round((100 * (r.aiTranslated + r.humanEdited + r.verified)) / r.totalKeys),
  }));
}

export type WorkbenchRow = {
  keyId: number;
  keyCode: string;
  categoryCode: string;
  baseText: string;
  baseLanguageCode: string;
  contextNoteText: string | null;
  translatedText: string | null;
  statusCode: "MISSING" | "AI_TRANSLATED" | "HUMAN_EDITED" | "VERIFIED" | "STALE";
};

export async function getWorkbenchRows(params: {
  languageCode: string;
  categoryCode?: string;
  status?: WorkbenchRow["statusCode"];
  search?: string;
}): Promise<WorkbenchRow[]> {
  const { languageCode, categoryCode, status, search } = params;
  const rows = await sql<(Omit<WorkbenchRow, "statusCode"> & { statusCode: string | null })[]>`
    SELECT tk.key_id AS "keyId", tk.key_code AS "keyCode", tk.category_code AS "categoryCode",
           tk.base_text AS "baseText", tk.base_language_code AS "baseLanguageCode", tk.context_note_text AS "contextNoteText",
           t.translated_text AS "translatedText", t.status_code AS "statusCode"
    FROM bayanat.translation_keys tk
    LEFT JOIN bayanat.translations t ON t.key_id = tk.key_id AND t.language_code = ${languageCode}
    WHERE tk.is_active_indicator = true
      ${categoryCode ? sql`AND tk.category_code = ${categoryCode}` : sql``}
      ${status ? (status === "MISSING" ? sql`AND t.status_code IS NULL` : sql`AND t.status_code = ${status}`) : sql``}
      ${search ? sql`AND (tk.key_code ILIKE ${"%" + search + "%"} OR tk.base_text ILIKE ${"%" + search + "%"} OR t.translated_text ILIKE ${"%" + search + "%"})` : sql``}
    ORDER BY tk.key_code
  `;
  return rows.map((r) => ({ ...r, statusCode: (r.statusCode ?? "MISSING") as WorkbenchRow["statusCode"] }));
}

export async function updateTranslation(keyId: number, languageCode: string, text: string, userId: string): Promise<void> {
  const [before] = await sql<{ translatedText: string | null }[]>`
    SELECT translated_text AS "translatedText" FROM bayanat.translations WHERE key_id = ${keyId} AND language_code = ${languageCode}
  `;
  await sql`
    INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at)
    VALUES (${keyId}, ${languageCode}, ${text}, 'HUMAN_EDITED', now())
    ON CONFLICT (key_id, language_code) DO UPDATE SET
      translated_text = EXCLUDED.translated_text, status_code = 'HUMAN_EDITED', translated_at = now()
  `;
  await logUpdate("TRANSLATIONS", keyId, userId, [
    { field: `translation.${languageCode}`, oldVal: before?.translatedText ?? null, newVal: text },
  ]);
}

export async function verifyTranslation(keyId: number, languageCode: string, userId: string): Promise<void> {
  await sql`
    UPDATE bayanat.translations SET status_code = 'VERIFIED', verified_at = now(), verified_by_user_id = ${userId}
    WHERE key_id = ${keyId} AND language_code = ${languageCode} AND translated_text IS NOT NULL
  `;
  await logUpdate("TRANSLATIONS", keyId, userId, [
    { field: `translation.${languageCode}.status`, oldVal: null, newVal: "VERIFIED", force: true },
  ]);
}

export async function revertToMissing(keyId: number, languageCode: string, userId: string): Promise<void> {
  await sql`DELETE FROM bayanat.translations WHERE key_id = ${keyId} AND language_code = ${languageCode}`;
  await logUpdate("TRANSLATIONS", keyId, userId, [
    { field: `translation.${languageCode}.status`, oldVal: null, newVal: "MISSING", force: true },
  ]);
}

/** Flattened key -> value bundle for a language, English base falling through for anything not yet translated (FR-4.3). */
export async function getTranslationBundle(languageCode: string): Promise<Record<string, string>> {
  if (languageCode === "en") return {};
  const rows = await sql<{ keyCode: string; translatedText: string }[]>`
    SELECT tk.key_code AS "keyCode", t.translated_text AS "translatedText"
    FROM bayanat.translation_keys tk
    JOIN bayanat.translations t ON t.key_id = tk.key_id AND t.language_code = ${languageCode}
    WHERE tk.is_active_indicator = true AND t.translated_text IS NOT NULL AND t.status_code <> 'STALE'
  `;
  return Object.fromEntries(rows.map((r) => [r.keyCode, r.translatedText]));
}
