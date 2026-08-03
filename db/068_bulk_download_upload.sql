-- Bulk Download / Upload Feature (Catalog Round-Trip).
-- See "Bayanatix - Bulk Download Upload Feature Spec.md" for the full design.
-- File bytes are stored as bytea in Postgres (this app's established convention for
-- persisted uploads — see bayanat.gov_framework_attachments — there's no disk/S3
-- storage path anywhere in the codebase to mirror instead).

CREATE TABLE IF NOT EXISTS bayanat.bulk_jobs (
  job_id                  serial PRIMARY KEY,
  job_type_code           varchar(20) NOT NULL,
  scope_json              jsonb,
  file_data               bytea,
  file_name_text          varchar(255),
  file_mime_type          varchar(150) NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  status_code             varchar(20) NOT NULL DEFAULT 'RUNNING',
  totals_json             jsonb,
  export_snapshot_at      timestamp,
  strict_mode_indicator   boolean NOT NULL DEFAULT false,
  conflict_policy_code    varchar(20) NOT NULL DEFAULT 'SKIP',
  result_file_data        bytea,
  error_text              text,
  created_by_user_id      varchar(100),
  created_at              timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at             timestamp,
  -- Retention (spec §6, default 90 days) — purged via an admin-triggered sweep
  -- (app/api/admin/bulk-jobs/purge), not a background cron: this app has no
  -- persistent worker process to run one on a schedule.
  purge_after             timestamp,
  CONSTRAINT bulk_jobs_type_check CHECK (job_type_code IN ('DOWNLOAD','UPLOAD')),
  CONSTRAINT bulk_jobs_status_check CHECK (status_code IN ('RUNNING','VALIDATED','AWAITING_CONFIRM','COMMITTED','FAILED','CANCELLED')),
  CONSTRAINT bulk_jobs_conflict_policy_check CHECK (conflict_policy_code IN ('SKIP','OVERWRITE'))
);

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_purge ON bayanat.bulk_jobs(purge_after) WHERE purge_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_creator ON bayanat.bulk_jobs(created_by_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bayanat.bulk_job_rows (
  row_id            serial PRIMARY KEY,
  job_id            int4 NOT NULL REFERENCES bayanat.bulk_jobs(job_id) ON DELETE CASCADE,
  sheet_name_text   varchar(50) NOT NULL,
  row_number_int    int4 NOT NULL,
  asset_type_code   varchar(50),
  asset_id          int4,
  outcome_code      varchar(20) NOT NULL,
  detail_json       jsonb,
  CONSTRAINT bulk_job_rows_outcome_check
    CHECK (outcome_code IN ('APPLIED','CREATED','SKIPPED_NOOP','SKIPPED_CONFLICT','ERROR'))
);

CREATE INDEX IF NOT EXISTS idx_bulk_job_rows_job ON bayanat.bulk_job_rows(job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_job_rows_outcome ON bayanat.bulk_job_rows(job_id, outcome_code);
