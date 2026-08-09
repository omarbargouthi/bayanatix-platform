// Language Management — AI translation (spec §3, FR-3). Generalizes the prompt
// idea already proven in app/api/governance/compliance/[frameworkId]/translate/route.ts
// but goes through the real LLM Provider Router (TRANSLATE capability) instead of a
// hardcoded ANTHROPIC_API_KEY call, and works over the translation_keys/translations
// tables instead of a one-off content hash cache.

import { sql } from "../db";
import { resolveProviderForCapability } from "../enrichment/provider-router";
import { callProfile } from "../enrichment/llm-adapters";
import { logUsage, getTokensUsedToday } from "../queries/llm-providers";

type KeyRow = {
  keyId: number; keyCode: string; baseText: string; contextNoteText: string | null;
  existingStatus: string | null; baseLanguageCode: string;
};

async function loadRows(keyIds: number[], languageCode: string): Promise<KeyRow[]> {
  return sql<KeyRow[]>`
    SELECT tk.key_id AS "keyId", tk.key_code AS "keyCode", tk.base_text AS "baseText", tk.context_note_text AS "contextNoteText",
           tk.base_language_code AS "baseLanguageCode", t.status_code AS "existingStatus"
    FROM bayanat.translation_keys tk
    LEFT JOIN bayanat.translations t ON t.key_id = tk.key_id AND t.language_code = ${languageCode}
    WHERE tk.key_id IN ${sql(keyIds)}
  `;
}

function buildPrompt(baseText: string, contextNote: string | null, baseLanguageName: string, targetLanguageName: string, protectedTerms: string[]): string {
  const parts = [`Translate the following ${baseLanguageName} text to ${targetLanguageName} accurately, keeping the same tone and register.`];
  if (protectedTerms.length > 0) parts.push(`Do not translate these terms — keep them exactly as written: ${protectedTerms.join(", ")}.`);
  if (contextNote) parts.push(`Context for this string: ${contextNote}.`);
  parts.push("Return only the translation with no extra commentary, quotes, or explanation.");
  return `${parts.join(" ")}\n\n${baseText}`;
}

export type TranslateBatchResult = { translated: number; skipped: number; failed: { keyId: number; keyCode: string; error: string }[] };

/**
 * Translates a batch of translation_keys into languageCode via the routed TRANSLATE
 * provider. Rows already HUMAN_EDITED or VERIFIED are left untouched (FR-2.3 — AI
 * translation never overwrites a human's work). Per-row failures are collected and
 * do not abort the rest of the batch (FR-3.2); a provider/budget failure that blocks
 * the whole batch is reported the same way, one failed entry per requested key.
 */
export async function translateBatch(keyIds: number[], languageCode: string): Promise<TranslateBatchResult> {
  if (keyIds.length === 0) return { translated: 0, skipped: 0, failed: [] };

  const languages = await sql<{ languageCode: string; languageNameText: string }[]>`
    SELECT language_code AS "languageCode", language_name_text AS "languageNameText" FROM bayanat.languages
  `;
  const langNameByCode = new Map(languages.map((l) => [l.languageCode, l.languageNameText]));
  const targetLanguageName = langNameByCode.get(languageCode);
  if (!targetLanguageName) return { translated: 0, skipped: 0, failed: keyIds.map((keyId) => ({ keyId, keyCode: "", error: `Unknown language code "${languageCode}"` })) };

  const protectedTerms = (await sql<{ termText: string }[]>`SELECT term_text AS "termText" FROM bayanat.translation_protected_terms`).map((r) => r.termText);

  const resolved = await resolveProviderForCapability("TRANSLATE");
  const rows = await loadRows(keyIds, languageCode);
  if ("error" in resolved) {
    return { translated: 0, skipped: 0, failed: rows.map((r) => ({ keyId: r.keyId, keyCode: r.keyCode, error: resolved.error })) };
  }
  const { profile, apiKey } = resolved;

  if (profile.dailyTokenBudget != null && profile.dailyTokenBudget > 0) {
    const usedToday = await getTokensUsedToday(profile.profileId);
    if (usedToday >= profile.dailyTokenBudget) {
      const error = `Daily token budget exceeded for provider "${profile.profileName}" — try again tomorrow or switch the TRANSLATE route`;
      return { translated: 0, skipped: 0, failed: rows.map((r) => ({ keyId: r.keyId, keyCode: r.keyCode, error })) };
    }
  }

  let translated = 0, skipped = 0;
  const failed: TranslateBatchResult["failed"] = [];

  for (const row of rows) {
    if (row.existingStatus === "HUMAN_EDITED" || row.existingStatus === "VERIFIED") {
      skipped++;
      continue;
    }
    if (row.baseLanguageCode === languageCode) {
      // Asking to translate a key into the same language its base_text is already
      // written in (e.g. an Arabic-base compliance key targeted at 'ar') — nothing
      // to do, not an error.
      skipped++;
      continue;
    }
    const baseLanguageName = langNameByCode.get(row.baseLanguageCode) ?? row.baseLanguageCode;
    const prompt = buildPrompt(row.baseText, row.contextNoteText, baseLanguageName, targetLanguageName, protectedTerms);
    try {
      const { text, inputTokens, outputTokens } = await callProfile(profile, apiKey, prompt, 1200);
      await logUsage(profile.profileId, "TRANSLATE", inputTokens, outputTokens, !!text);
      if (!text) throw new Error("LLM returned an empty response");
      await sql`
        INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, model_ref_text, translated_at)
        VALUES (${row.keyId}, ${languageCode}, ${text.trim()}, 'AI_TRANSLATED', ${`${profile.profileName}:${profile.modelName}`}, now())
        ON CONFLICT (key_id, language_code) DO UPDATE SET
          translated_text = EXCLUDED.translated_text, status_code = 'AI_TRANSLATED',
          model_ref_text = EXCLUDED.model_ref_text, translated_at = now()
      `;
      translated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Translation call failed";
      await logUsage(profile.profileId, "TRANSLATE", 0, 0, false, message);
      failed.push({ keyId: row.keyId, keyCode: row.keyCode, error: message });
    }
  }

  return { translated, skipped, failed };
}

/** FR-3.3 "Translate everything": every MISSING/STALE/AI_TRANSLATED key for a category into languageCode. */
export async function translateCategory(categoryCode: string, languageCode: string): Promise<TranslateBatchResult> {
  const rows = await sql<{ keyId: number }[]>`
    SELECT tk.key_id AS "keyId"
    FROM bayanat.translation_keys tk
    LEFT JOIN bayanat.translations t ON t.key_id = tk.key_id AND t.language_code = ${languageCode}
    WHERE tk.category_code = ${categoryCode} AND tk.is_active_indicator = true
      AND tk.base_language_code <> ${languageCode}
      AND (t.status_code IS NULL OR t.status_code NOT IN ('HUMAN_EDITED', 'VERIFIED'))
  `;
  return translateBatch(rows.map((r) => r.keyId), languageCode);
}
