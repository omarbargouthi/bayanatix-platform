// Bulk Download/Upload — job bookkeeping (spec §4). File bytes travel through this
// table directly (bytea) rather than a separate plans-cache: every diff/commit call
// re-parses + re-validates from the stored bytes, which is simple and always
// reflects current DB state rather than a possibly-stale cached plan.
//
// Jobs run in the background (see app/api/bulk/downloads and
// app/api/bulk/uploads/[id]/commit): the POST handler creates the job row and
// returns immediately, then keeps working after the response is sent (this only
// works because this app is a persistent Node process — `next dev`/`next start` —
// not a serverless function that freezes after responding; if ever deployed to
// Vercel serverless, this needs `unstable_after()` or a real queue instead).

import { sql } from "../db";

export type JobType = "DOWNLOAD" | "UPLOAD";
export type JobStatus = "RUNNING" | "VALIDATED" | "AWAITING_CONFIRM" | "COMMITTED" | "FAILED" | "CANCELLED";

export type BulkJob = {
  jobId: number;
  jobTypeCode: JobType;
  scope: unknown;
  fileName: string | null;
  status: JobStatus;
  totals: unknown;
  exportSnapshotAt: string | null;
  strictMode: boolean;
  conflictPolicy: "SKIP" | "OVERWRITE";
  createdByUserId: string | null;
  createdAt: string;
  finishedAt: string | null;
  errorText: string | null;
  hasFile: boolean;
  hasResultFile: boolean;
  hasLogFile: boolean;
  hasRejectedFile: boolean;
};

const JOB_COLS = `
  job_id AS "jobId", job_type_code AS "jobTypeCode", scope_json AS scope, file_name_text AS "fileName",
  status_code AS status, totals_json AS totals, export_snapshot_at::text AS "exportSnapshotAt",
  strict_mode_indicator AS "strictMode", conflict_policy_code AS "conflictPolicy",
  created_by_user_id AS "createdByUserId", created_at::text AS "createdAt", finished_at::text AS "finishedAt",
  error_text AS "errorText",
  (file_data IS NOT NULL) AS "hasFile", (result_file_data IS NOT NULL) AS "hasResultFile",
  (log_file_data IS NOT NULL) AS "hasLogFile", (rejected_file_data IS NOT NULL) AS "hasRejectedFile"
`;

export async function createDownloadJob(scope: unknown, userId: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.bulk_jobs (job_type_code, scope_json, status_code, created_by_user_id, purge_after)
    VALUES ('DOWNLOAD', ${JSON.stringify(scope) as never}, 'RUNNING', ${userId}, NOW() + INTERVAL '90 days')
    RETURNING job_id AS id
  `;
  return row.id;
}

export async function finishDownloadJob(jobId: number, fileName: string, fileData: Buffer, logFile: Buffer, totals: unknown): Promise<void> {
  await sql`
    UPDATE bayanat.bulk_jobs SET status_code = 'COMMITTED', file_name_text = ${fileName}, file_data = ${fileData},
      log_file_data = ${logFile}, totals_json = ${JSON.stringify(totals) as never}, finished_at = NOW()
    WHERE job_id = ${jobId}
  `;
}

export async function createUploadJob(fileName: string, fileData: Buffer, userId: string, opts: { strictMode: boolean; conflictPolicy: "SKIP" | "OVERWRITE"; exportSnapshotAt: Date | null }): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.bulk_jobs (job_type_code, status_code, file_name_text, file_data, created_by_user_id,
      strict_mode_indicator, conflict_policy_code, export_snapshot_at, purge_after)
    VALUES ('UPLOAD', 'AWAITING_CONFIRM', ${fileName}, ${fileData}, ${userId},
      ${opts.strictMode}, ${opts.conflictPolicy}, ${opts.exportSnapshotAt}, NOW() + INTERVAL '90 days')
    RETURNING job_id AS id
  `;
  return row.id;
}

/** Flips an AWAITING_CONFIRM upload job to RUNNING right before the (backgrounded) commit starts. */
export async function markJobRunning(jobId: number): Promise<void> {
  await sql`UPDATE bayanat.bulk_jobs SET status_code = 'RUNNING' WHERE job_id = ${jobId}`;
}

export async function getBulkJob(jobId: number): Promise<BulkJob | null> {
  const rows = await sql<BulkJob[]>`SELECT ${sql.unsafe(JOB_COLS)} FROM bayanat.bulk_jobs WHERE job_id = ${jobId}`;
  return rows[0] ?? null;
}

export async function getBulkJobFile(jobId: number): Promise<{ fileName: string | null; fileData: Buffer | null } | null> {
  const rows = await sql<{ fileName: string | null; fileData: Buffer | null }[]>`
    SELECT file_name_text AS "fileName", file_data AS "fileData" FROM bayanat.bulk_jobs WHERE job_id = ${jobId}
  `;
  return rows[0] ?? null;
}

export async function getBulkJobResultFile(jobId: number): Promise<Buffer | null> {
  const rows = await sql<{ resultFileData: Buffer | null }[]>`SELECT result_file_data AS "resultFileData" FROM bayanat.bulk_jobs WHERE job_id = ${jobId}`;
  return rows[0]?.resultFileData ?? null;
}

export async function getBulkJobLogFile(jobId: number): Promise<Buffer | null> {
  const rows = await sql<{ logFileData: Buffer | null }[]>`SELECT log_file_data AS "logFileData" FROM bayanat.bulk_jobs WHERE job_id = ${jobId}`;
  return rows[0]?.logFileData ?? null;
}

export async function getBulkJobRejectedFile(jobId: number): Promise<Buffer | null> {
  const rows = await sql<{ rejectedFileData: Buffer | null }[]>`SELECT rejected_file_data AS "rejectedFileData" FROM bayanat.bulk_jobs WHERE job_id = ${jobId}`;
  return rows[0]?.rejectedFileData ?? null;
}

export async function finishUploadCommit(jobId: number, totals: unknown, resultFile: Buffer, logFile: Buffer, rejectedFile: Buffer | null): Promise<void> {
  await sql`
    UPDATE bayanat.bulk_jobs SET status_code = 'COMMITTED', totals_json = ${JSON.stringify(totals) as never},
      result_file_data = ${resultFile}, log_file_data = ${logFile}, rejected_file_data = ${rejectedFile}, finished_at = NOW()
    WHERE job_id = ${jobId}
  `;
}

export async function failJob(jobId: number, errorText: string): Promise<void> {
  await sql`UPDATE bayanat.bulk_jobs SET status_code = 'FAILED', error_text = ${errorText}, finished_at = NOW() WHERE job_id = ${jobId}`;
}

export async function listBulkJobs(userId?: string): Promise<BulkJob[]> {
  if (userId) return sql<BulkJob[]>`SELECT ${sql.unsafe(JOB_COLS)} FROM bayanat.bulk_jobs WHERE created_by_user_id = ${userId} ORDER BY created_at DESC LIMIT 100`;
  return sql<BulkJob[]>`SELECT ${sql.unsafe(JOB_COLS)} FROM bayanat.bulk_jobs ORDER BY created_at DESC LIMIT 100`;
}

/** Retention sweep (spec §6, default 90 days) — admin-triggered, no background cron. */
export async function purgeExpiredJobFiles(): Promise<number> {
  const result = await sql`
    UPDATE bayanat.bulk_jobs SET file_data = NULL, result_file_data = NULL, log_file_data = NULL, rejected_file_data = NULL
    WHERE purge_after IS NOT NULL AND purge_after < NOW() AND (file_data IS NOT NULL OR result_file_data IS NOT NULL OR log_file_data IS NOT NULL OR rejected_file_data IS NOT NULL)
  `;
  return result.count;
}
