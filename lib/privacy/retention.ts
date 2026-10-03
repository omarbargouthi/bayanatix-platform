// Retention for Bayanis's own records (storage limitation). Periods come from
// platform_policy_settings; NULL = keep forever. Runs daily via the scheduler
// (scripts/scheduler.mjs -> /api/admin/retention/run) and on demand from
// Configuration > Privacy & Retention. Consent decisions are never purged — they
// are the evidence that a user accepted the notice.
import { sql } from "../db";
import { getPolicySettings } from "./policy-settings";

export type RetentionResult = {
  auditLogs: number; dataAccessLogs: number; crawlJobLogLines: number; crawlJobs: number;
  backgroundJobs: number; notifications: number; dqSamples: number;
};

const olderThan = (days: number) => sql`now() - make_interval(days => ${days})`;

export async function runRetention(): Promise<RetentionResult> {
  const s = await getPolicySettings();
  const r: RetentionResult = { auditLogs: 0, dataAccessLogs: 0, crawlJobLogLines: 0, crawlJobs: 0, backgroundJobs: 0, notifications: 0, dqSamples: 0 };

  if (s.auditLogDays != null) {
    // history_logs (the field-level details) cascade with their audit row.
    r.auditLogs = (await sql`DELETE FROM bayanat.audit_logs WHERE action_timestamp < ${olderThan(s.auditLogDays)}`).count;
  }
  if (s.dataAccessLogDays != null) {
    r.dataAccessLogs = (await sql`DELETE FROM bayanat.data_access_log WHERE accessed_at < ${olderThan(s.dataAccessLogDays)}`).count;
  }
  if (s.jobLogDays != null) {
    r.crawlJobLogLines = (await sql`
      DELETE FROM bayanat.crawl_job_logs l USING bayanat.crawl_jobs j
      WHERE l.job_id = j.job_id AND coalesce(j.finished_at, j.started_at) < ${olderThan(s.jobLogDays)}
    `).count;
    // Profiles keep their data; their link to the crawl that produced them is cleared (ON DELETE SET NULL).
    r.crawlJobs = (await sql`
      DELETE FROM bayanat.crawl_jobs j WHERE coalesce(j.finished_at, j.started_at) < ${olderThan(s.jobLogDays)}
    `).count;
    r.backgroundJobs = (await sql`
      DELETE FROM bayanat.background_jobs WHERE status_code <> 'RUNNING' AND created_at < ${olderThan(s.jobLogDays)}
    `).count;
  }
  if (s.notificationDays != null) {
    r.notifications = (await sql`DELETE FROM bayanat.notifications WHERE created_at < ${olderThan(s.notificationDays)}`).count;
  }
  if (s.dqSampleDays != null) {
    r.dqSamples = (await sql`DELETE FROM bayanat.dq_run_samples WHERE created_at < ${olderThan(s.dqSampleDays)}`).count;
  }

  await sql`
    UPDATE bayanat.platform_policy_settings SET last_retention_run_at = now(), last_retention_result = ${sql.json(r)}
    WHERE settings_id = 1
  `;
  return r;
}

/** Scheduler entry point: runs at most once a day. */
export async function runRetentionIfDue(): Promise<{ ran: boolean; result?: RetentionResult }> {
  const [row] = await sql<{ due: boolean }[]>`
    SELECT last_retention_run_at IS NULL OR last_retention_run_at < now() - interval '23 hours' AS due
    FROM bayanat.platform_policy_settings WHERE settings_id = 1
  `;
  if (!row?.due) return { ran: false };
  return { ran: true, result: await runRetention() };
}
