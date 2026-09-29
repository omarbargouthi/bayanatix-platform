import { sql } from "../db";

export type BackgroundJobStatus = "RUNNING" | "COMPLETED" | "FAILED";

export type BackgroundJob = {
  jobId: number;
  jobTypeCode: string;
  paramsJson: Record<string, unknown> | null;
  status: BackgroundJobStatus;
  progressProcessed: number | null;
  progressTotal: number | null;
  resultFileName: string | null;
  resultFileMimeType: string | null;
  resultJson: Record<string, unknown> | null;
  hasResultFile: boolean;
  hasLogFile: boolean;
  errorText: string | null;
  createdByUserId: string | null;
  createdAt: string;
  finishedAt: string | null;
};

const JOB_COLS = sql.unsafe(`
  job_id                          AS "jobId",
  job_type_code                   AS "jobTypeCode",
  params_json                     AS "paramsJson",
  status_code                     AS "status",
  progress_processed              AS "progressProcessed",
  progress_total                  AS "progressTotal",
  result_file_name                AS "resultFileName",
  result_file_mime_type           AS "resultFileMimeType",
  result_json                     AS "resultJson",
  (result_file_data IS NOT NULL)  AS "hasResultFile",
  (log_file_data IS NOT NULL)     AS "hasLogFile",
  error_text                      AS "errorText",
  created_by_user_id              AS "createdByUserId",
  created_at::text                AS "createdAt",
  finished_at::text               AS "finishedAt"
`);

export async function createJob(
  jobTypeCode: string, paramsJson: Record<string, unknown> | null, userId: string,
): Promise<number> {
  const [row] = await sql<{ jobId: number }[]>`
    INSERT INTO bayanat.background_jobs (job_type_code, params_json, created_by_user_id)
    VALUES (${jobTypeCode}, ${paramsJson ? sql.json(paramsJson as any) : null}, ${userId})
    RETURNING job_id AS "jobId"
  `;
  return row.jobId;
}

export async function updateJobProgress(jobId: number, processed: number, total: number): Promise<void> {
  await sql`
    UPDATE bayanat.background_jobs SET progress_processed = ${processed}, progress_total = ${total}
    WHERE job_id = ${jobId}
  `;
}

export async function finishJob(jobId: number, result: {
  resultFileData?: Buffer;
  resultFileName?: string;
  resultFileMimeType?: string;
  resultJson?: Record<string, unknown>;
  logFileData?: Buffer;
}): Promise<void> {
  await sql`
    UPDATE bayanat.background_jobs SET
      status_code            = 'COMPLETED',
      result_file_data        = ${result.resultFileData ?? null},
      result_file_name        = ${result.resultFileName ?? null},
      result_file_mime_type   = ${result.resultFileMimeType ?? null},
      result_json             = ${result.resultJson ? sql.json(result.resultJson as any) : null},
      log_file_data            = ${result.logFileData ?? null},
      finished_at              = NOW()
    WHERE job_id = ${jobId}
  `;
}

export async function failJob(jobId: number, errorText: string, logFileData?: Buffer): Promise<void> {
  await sql`
    UPDATE bayanat.background_jobs SET
      status_code = 'FAILED', error_text = ${errorText}, log_file_data = ${logFileData ?? null}, finished_at = NOW()
    WHERE job_id = ${jobId}
  `;
}

export async function getJob(jobId: number): Promise<BackgroundJob | null> {
  const [row] = await sql<BackgroundJob[]>`SELECT ${JOB_COLS} FROM bayanat.background_jobs WHERE job_id = ${jobId}`;
  return row ?? null;
}

// Own jobs only, unless ADMIN — mirrors the existing bulk_jobs list convention.
export async function listJobs(jobTypeCodes: string[], userId: string, isAdmin: boolean): Promise<BackgroundJob[]> {
  if (isAdmin) {
    return sql<BackgroundJob[]>`
      SELECT ${JOB_COLS} FROM bayanat.background_jobs
      WHERE job_type_code = ANY(${jobTypeCodes})
      ORDER BY created_at DESC LIMIT 100
    `;
  }
  return sql<BackgroundJob[]>`
    SELECT ${JOB_COLS} FROM bayanat.background_jobs
    WHERE job_type_code = ANY(${jobTypeCodes}) AND created_by_user_id = ${userId}
    ORDER BY created_at DESC LIMIT 100
  `;
}

export async function getJobResultFile(jobId: number): Promise<Buffer | null> {
  const [row] = await sql<{ data: Buffer | null }[]>`SELECT result_file_data AS data FROM bayanat.background_jobs WHERE job_id = ${jobId}`;
  return row?.data ?? null;
}

export async function getJobLogFile(jobId: number): Promise<Buffer | null> {
  const [row] = await sql<{ data: Buffer | null }[]>`SELECT log_file_data AS data FROM bayanat.background_jobs WHERE job_id = ${jobId}`;
  return row?.data ?? null;
}
