import { sql } from "../db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CrawlJob = {
  jobId:         number;
  connectionId:  number | null;
  connectionName: string;
  startedAt:     string;
  finishedAt:    string | null;
  status:        string;
  schemaCount:   number;
  tableCount:    number;
  columnCount:   number;
  errorText:     string | null;
};

export type CrawlJobLog = {
  logId:     number;
  jobId:     number;
  loggedAt:  string;
  level:     string;
  message:   string;
};

// ── Column fragment ───────────────────────────────────────────────────────────

const JOB_COLS = sql.unsafe(`
  job_id                        AS "jobId",
  connection_id                 AS "connectionId",
  connection_name               AS "connectionName",
  started_at::text              AS "startedAt",
  finished_at::text             AS "finishedAt",
  status                        AS "status",
  coalesce(schema_count,  0)    AS "schemaCount",
  coalesce(table_count,   0)    AS "tableCount",
  coalesce(column_count,  0)    AS "columnCount",
  error_text                    AS "errorText"
`);

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Insert a new crawl job row with status RUNNING and return its job_id.
 */
export async function createCrawlJob(
  connectionId: number,
  connectionName: string,
): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.crawl_jobs
      (connection_id, connection_name, started_at, status)
    VALUES
      (${connectionId}, ${connectionName}, NOW(), 'RUNNING')
    RETURNING job_id AS id
  `;
  return row.id;
}

/**
 * Append a log entry for the given job.
 */
export async function addCrawlJobLog(
  jobId: number,
  level: "INFO" | "WARN" | "ERROR",
  message: string,
): Promise<void> {
  await sql`
    INSERT INTO bayanat.crawl_job_logs (job_id, logged_at, level, message)
    VALUES (${jobId}, NOW(), ${level}, ${message})
  `;
}

/**
 * Mark a job as COMPLETED and record final counts.
 */
export async function finishCrawlJob(
  jobId: number,
  schemaCount: number,
  tableCount: number,
  columnCount: number,
): Promise<void> {
  await sql`
    UPDATE bayanat.crawl_jobs
    SET
      status       = 'COMPLETED',
      finished_at  = NOW(),
      schema_count = ${schemaCount},
      table_count  = ${tableCount},
      column_count = ${columnCount}
    WHERE job_id = ${jobId}
  `;
}

/**
 * Mark a job as FAILED and store the error message.
 */
export async function failCrawlJob(
  jobId: number,
  errorText: string,
): Promise<void> {
  await sql`
    UPDATE bayanat.crawl_jobs
    SET
      status      = 'FAILED',
      finished_at = NOW(),
      error_text  = ${errorText}
    WHERE job_id = ${jobId}
  `;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * List up to 200 jobs, most recent first.
 * Optionally filtered to a single connection.
 */
export async function listCrawlJobs(
  connectionId?: number,
): Promise<CrawlJob[]> {
  if (connectionId !== undefined) {
    return sql<CrawlJob[]>`
      SELECT ${JOB_COLS}
      FROM   bayanat.crawl_jobs
      WHERE  connection_id = ${connectionId}
      ORDER  BY started_at DESC
      LIMIT  200
    `;
  }
  return sql<CrawlJob[]>`
    SELECT ${JOB_COLS}
    FROM   bayanat.crawl_jobs
    ORDER  BY started_at DESC
    LIMIT  200
  `;
}

/**
 * Return all log rows for a job in chronological order.
 */
export async function getCrawlJobLogs(jobId: number): Promise<CrawlJobLog[]> {
  return sql<CrawlJobLog[]>`
    SELECT
      log_id          AS "logId",
      job_id          AS "jobId",
      logged_at::text AS "loggedAt",
      level           AS "level",
      message         AS "message"
    FROM  bayanat.crawl_job_logs
    WHERE job_id = ${jobId}
    ORDER BY logged_at ASC
  `;
}
