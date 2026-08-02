// Generic bulk-job bookkeeping shared by both enrichment capabilities. Mirrors
// lib/queries/crawl-jobs.ts's job-row + log-row + fire-and-forget/poll pattern.

import { sql } from "../db";

export type JobType = "DESCRIPTION" | "DQ_RULE";
export type JobStatus = "RUNNING" | "COMPLETED" | "FAILED";

export type EnrichmentJob = {
  jobId: number;
  jobTypeCode: JobType;
  status: JobStatus;
  scope: unknown;
  triggeredByUserId: string | null;
  startedAt: string;
  finishedAt: string | null;
  totalCount: number;
  succeededCount: number;
  failedCount: number;
  errorText: string | null;
};

export type EnrichmentJobLog = { logId: number; jobId: number; loggedAt: string; level: string; message: string };

export async function createEnrichmentJob(jobType: JobType, scope: unknown, userId: string, totalCount: number): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.enrichment_jobs (job_type_code, scope_json, triggered_by_user_id, status_code, total_count)
    VALUES (${jobType}, ${scope as any}, ${userId}, 'RUNNING', ${totalCount})
    RETURNING job_id AS id
  `;
  return row.id;
}

export async function addEnrichmentJobLog(jobId: number, level: "INFO" | "WARN" | "ERROR", message: string): Promise<void> {
  await sql`INSERT INTO bayanat.enrichment_job_logs (job_id, level, message) VALUES (${jobId}, ${level}, ${message})`;
}

export async function bumpEnrichmentJobProgress(jobId: number, succeededDelta: number, failedDelta: number): Promise<void> {
  await sql`
    UPDATE bayanat.enrichment_jobs
    SET succeeded_count = succeeded_count + ${succeededDelta}, failed_count = failed_count + ${failedDelta}
    WHERE job_id = ${jobId}
  `;
}

export async function finishEnrichmentJob(jobId: number): Promise<void> {
  await sql`UPDATE bayanat.enrichment_jobs SET status_code = 'COMPLETED', finished_at = NOW() WHERE job_id = ${jobId}`;
}

export async function failEnrichmentJob(jobId: number, errorText: string): Promise<void> {
  await sql`UPDATE bayanat.enrichment_jobs SET status_code = 'FAILED', finished_at = NOW(), error_text = ${errorText} WHERE job_id = ${jobId}`;
}

export async function getEnrichmentJob(jobId: number): Promise<EnrichmentJob | null> {
  const [row] = await sql<EnrichmentJob[]>`
    SELECT job_id AS "jobId", job_type_code AS "jobTypeCode", status_code AS status, scope_json AS scope,
           triggered_by_user_id AS "triggeredByUserId", started_at::text AS "startedAt", finished_at::text AS "finishedAt",
           total_count AS "totalCount", succeeded_count AS "succeededCount", failed_count AS "failedCount", error_text AS "errorText"
    FROM bayanat.enrichment_jobs WHERE job_id = ${jobId}
  `;
  return row ?? null;
}

export async function getEnrichmentJobLogs(jobId: number): Promise<EnrichmentJobLog[]> {
  return sql<EnrichmentJobLog[]>`
    SELECT log_id AS "logId", job_id AS "jobId", logged_at::text AS "loggedAt", level, message
    FROM bayanat.enrichment_job_logs WHERE job_id = ${jobId} ORDER BY logged_at ASC
  `;
}

export async function listEnrichmentJobs(jobType?: JobType): Promise<EnrichmentJob[]> {
  if (jobType) {
    return sql<EnrichmentJob[]>`
      SELECT job_id AS "jobId", job_type_code AS "jobTypeCode", status_code AS status, scope_json AS scope,
             triggered_by_user_id AS "triggeredByUserId", started_at::text AS "startedAt", finished_at::text AS "finishedAt",
             total_count AS "totalCount", succeeded_count AS "succeededCount", failed_count AS "failedCount", error_text AS "errorText"
      FROM bayanat.enrichment_jobs WHERE job_type_code = ${jobType} ORDER BY started_at DESC LIMIT 200
    `;
  }
  return sql<EnrichmentJob[]>`
    SELECT job_id AS "jobId", job_type_code AS "jobTypeCode", status_code AS status, scope_json AS scope,
           triggered_by_user_id AS "triggeredByUserId", started_at::text AS "startedAt", finished_at::text AS "finishedAt",
           total_count AS "totalCount", succeeded_count AS "succeededCount", failed_count AS "failedCount", error_text AS "errorText"
    FROM bayanat.enrichment_jobs ORDER BY started_at DESC LIMIT 200
  `;
}
