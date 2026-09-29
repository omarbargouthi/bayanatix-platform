-- Migration 124: Generic background jobs for synchronous export/import routes
-- =====================================================================
-- Reports XLSX/PDF export, Governance Compliance export/import, and
-- Translations export/import all ran fully synchronously (the browser
-- waited for Puppeteer/XLSX-building/row-by-row import to finish) — a real
-- problem once a source has thousands of columns. Rather than building six
-- bespoke job tables, one generic table covers all of them: a background
-- task with optional params, progress, and an output file + log + result
-- summary. bayanat.bulk_jobs stays separate — its extra fields
-- (conflict_policy_code, rejected_file_data, scope_json) are specific to
-- its diff/commit workflow and don't apply here.

CREATE TABLE IF NOT EXISTS bayanat.background_jobs (
  job_id                SERIAL PRIMARY KEY,
  job_type_code         TEXT NOT NULL,
  params_json           JSONB,
  status_code           TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status_code IN ('RUNNING', 'COMPLETED', 'FAILED')),
  progress_processed    INT,
  progress_total        INT,
  result_file_data      BYTEA,
  result_file_name      TEXT,
  result_file_mime_type TEXT,
  result_json           JSONB,
  log_file_data         BYTEA,
  error_text            TEXT,
  created_by_user_id    TEXT REFERENCES bayanat.users(user_id),
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at           TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_creator ON bayanat.background_jobs(created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON bayanat.background_jobs(job_type_code, created_at DESC);
