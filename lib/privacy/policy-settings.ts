// Platform policy settings (db/144): retention periods for Bayanis's own records,
// and the acceptable-use / activity-monitoring consent shown after sign-in.
// The notice is English-base like other admin-defined text: other languages are
// translated in Languages & Translations (category PLATFORM_CONSENT, db/145).
import { sql } from "../db";
import { upsertKey } from "../i18n-admin/translatable-fields";

const CONSENT_KEYS = { title: "platform_consent.1.title", text: "platform_consent.1.text" };

export type RetentionSettings = {
  auditLogDays: number | null;
  dataAccessLogDays: number | null;
  jobLogDays: number | null;
  notificationDays: number | null;
  dqSampleDays: number | null;
};
export type ConsentSettings = {
  consentEnabled: boolean; consentVersion: number;
  consentTitleEn: string; consentTextEn: string;
  consentUpdatedAt: string | null;
};
export type PolicySettings = RetentionSettings & ConsentSettings & {
  lastRetentionRunAt: string | null; lastRetentionResult: Record<string, number> | null;
};

export async function getPolicySettings(): Promise<PolicySettings> {
  const [row] = await sql<PolicySettings[]>`
    SELECT audit_log_days AS "auditLogDays", data_access_log_days AS "dataAccessLogDays", job_log_days AS "jobLogDays",
           notification_days AS "notificationDays", dq_sample_days AS "dqSampleDays",
           last_retention_run_at::text AS "lastRetentionRunAt", last_retention_result AS "lastRetentionResult",
           consent_enabled AS "consentEnabled", consent_version AS "consentVersion",
           consent_title_en AS "consentTitleEn", consent_text_en AS "consentTextEn",
           consent_updated_at::text AS "consentUpdatedAt"
    FROM bayanat.platform_policy_settings WHERE settings_id = 1
  `;
  return row;
}

export async function updateRetentionSettings(s: RetentionSettings, userId: string): Promise<void> {
  await sql`
    UPDATE bayanat.platform_policy_settings SET
      audit_log_days = ${s.auditLogDays}, data_access_log_days = ${s.dataAccessLogDays}, job_log_days = ${s.jobLogDays},
      notification_days = ${s.notificationDays}, dq_sample_days = ${s.dqSampleDays},
      updated_at = now(), updated_by_user_id = ${userId}
    WHERE settings_id = 1
  `;
}

/** requireReacceptance bumps the version, so everyone is asked again. */
export async function updateConsentSettings(
  c: { enabled: boolean; titleEn: string; textEn: string; requireReacceptance: boolean }, userId: string,
): Promise<void> {
  await sql`
    UPDATE bayanat.platform_policy_settings SET
      consent_enabled = ${c.enabled},
      consent_title_en = ${c.titleEn}, consent_text_en = ${c.textEn},
      consent_version = consent_version + ${c.requireReacceptance ? 1 : 0},
      consent_updated_at = now(), consent_updated_by = ${userId}, updated_at = now(), updated_by_user_id = ${userId}
    WHERE settings_id = 1
  `;
  // Keep the translation keys in step right away (not on the next Workbench sync):
  // a changed English text marks existing translations STALE, so nobody is shown
  // a translation of wording that no longer applies.
  const counters = { keysCreated: 0, keysUpdatedStale: 0, secondarySeeded: 0 };
  if (c.titleEn.trim()) await upsertKey(counters, "PLATFORM_CONSENT", CONSENT_KEYS.title, c.titleEn.trim(), "en", "ar", null);
  if (c.textEn.trim()) await upsertKey(counters, "PLATFORM_CONSENT", CONSENT_KEYS.text, c.textEn.trim(), "en", "ar", null);
}

/** The notice in the user's language; falls back to English while a translation
 *  is missing or out of date (STALE), same as other translated text. */
export async function getConsentNotice(lang: string): Promise<{ title: string; text: string; version: number; lang: string }> {
  const s = await getPolicySettings();
  const english = { title: s.consentTitleEn, text: s.consentTextEn, version: s.consentVersion, lang: "en" };
  if (lang === "en") return english;
  const rows = await sql<{ keyCode: string; text: string }[]>`
    SELECT tk.key_code AS "keyCode", tr.translated_text AS text
    FROM bayanat.translation_keys tk
    JOIN bayanat.translations tr ON tr.key_id = tk.key_id
    WHERE tk.key_code IN ${sql([CONSENT_KEYS.title, CONSENT_KEYS.text])} AND tr.language_code = ${lang}
      AND tr.status_code <> 'STALE' AND btrim(coalesce(tr.translated_text, '')) <> ''
  `;
  const tr = Object.fromEntries(rows.map((r) => [r.keyCode, r.text]));
  // Title and text are a pair: switch language only when the body itself is translated.
  if (!tr[CONSENT_KEYS.text]) return english;
  return { title: tr[CONSENT_KEYS.title] ?? s.consentTitleEn, text: tr[CONSENT_KEYS.text], version: s.consentVersion, lang };
}

/** Per enabled non-English language: is the notice translated and current? */
export async function getConsentTranslationStatus(): Promise<{ languageCode: string; languageName: string; status: "CURRENT" | "STALE" | "MISSING" }[]> {
  return sql<{ languageCode: string; languageName: string; status: "CURRENT" | "STALE" | "MISSING" }[]>`
    SELECT l.language_code AS "languageCode", l.language_name_text AS "languageName",
      CASE
        WHEN count(tr.translation_id) FILTER (WHERE tr.status_code = 'STALE') > 0 THEN 'STALE'
        WHEN count(tr.translation_id) FILTER (WHERE tr.status_code <> 'MISSING' AND btrim(coalesce(tr.translated_text, '')) <> '')
             = count(tk.key_id) AND count(tk.key_id) > 0 THEN 'CURRENT'
        ELSE 'MISSING'
      END AS status
    FROM bayanat.languages l
    LEFT JOIN bayanat.translation_keys tk ON tk.category_code = 'PLATFORM_CONSENT'
    LEFT JOIN bayanat.translations tr ON tr.key_id = tk.key_id AND tr.language_code = l.language_code
    WHERE l.is_enabled_indicator AND l.language_code <> 'en'
    GROUP BY l.language_code, l.language_name_text
    ORDER BY l.language_name_text
  `;
}

/** True when consent is switched on and this user hasn't accepted the current version. */
export async function needsConsent(userId: string): Promise<boolean> {
  const [row] = await sql<{ needs: boolean }[]>`
    SELECT s.consent_enabled AND NOT EXISTS (
      SELECT 1 FROM bayanat.user_consents c
      WHERE c.user_id = ${userId} AND c.consent_version = s.consent_version AND c.decision_code = 'ACCEPTED'
    ) AS needs
    FROM bayanat.platform_policy_settings s WHERE s.settings_id = 1
  `;
  return !!row?.needs;
}

export async function recordConsent(entry: {
  userId: string; version: number; decision: "ACCEPTED" | "DECLINED"; ip: string | null; userAgent: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO bayanat.user_consents (user_id, consent_version, decision_code, ip_address_text, user_agent_text)
    VALUES (${entry.userId}, ${entry.version}, ${entry.decision}, ${entry.ip?.slice(0, 45) ?? null}, ${entry.userAgent})
  `;
}

export async function getConsentStats(): Promise<{
  version: number; activeUsers: number; accepted: number;
  recent: { userName: string; userId: string; version: number; decision: string; decidedAt: string }[];
}> {
  const [counts] = await sql<{ version: number; activeUsers: number; accepted: number }[]>`
    SELECT s.consent_version AS version,
      (SELECT count(*)::int FROM bayanat.users u WHERE coalesce(u.is_active, true)) AS "activeUsers",
      (SELECT count(DISTINCT c.user_id)::int FROM bayanat.user_consents c
        WHERE c.consent_version = s.consent_version AND c.decision_code = 'ACCEPTED') AS accepted
    FROM bayanat.platform_policy_settings s WHERE s.settings_id = 1
  `;
  const recent = await sql<{ userName: string; userId: string; version: number; decision: string; decidedAt: string }[]>`
    SELECT coalesce(u.full_name, c.user_id) AS "userName", c.user_id AS "userId", c.consent_version AS version,
           c.decision_code AS decision, c.decided_at::text AS "decidedAt"
    FROM bayanat.user_consents c LEFT JOIN bayanat.users u ON u.user_id = c.user_id
    ORDER BY c.decided_at DESC LIMIT 25
  `;
  return { ...counts, recent };
}
