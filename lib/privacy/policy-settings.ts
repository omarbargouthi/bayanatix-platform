// Platform policy settings (db/144): retention periods for Bayanis's own records,
// and the acceptable-use / activity-monitoring consent shown after sign-in.
import { sql } from "../db";

export type RetentionSettings = {
  auditLogDays: number | null;
  dataAccessLogDays: number | null;
  jobLogDays: number | null;
  notificationDays: number | null;
  dqSampleDays: number | null;
};
export type ConsentSettings = {
  consentEnabled: boolean; consentVersion: number;
  consentTitleEn: string; consentTextEn: string; consentTitleAr: string; consentTextAr: string;
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
           consent_title_ar AS "consentTitleAr", consent_text_ar AS "consentTextAr",
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
  c: { enabled: boolean; titleEn: string; textEn: string; titleAr: string; textAr: string; requireReacceptance: boolean }, userId: string,
): Promise<void> {
  await sql`
    UPDATE bayanat.platform_policy_settings SET
      consent_enabled = ${c.enabled},
      consent_title_en = ${c.titleEn}, consent_text_en = ${c.textEn},
      consent_title_ar = ${c.titleAr}, consent_text_ar = ${c.textAr},
      consent_version = consent_version + ${c.requireReacceptance ? 1 : 0},
      consent_updated_at = now(), consent_updated_by = ${userId}, updated_at = now(), updated_by_user_id = ${userId}
    WHERE settings_id = 1
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
