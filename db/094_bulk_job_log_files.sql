-- Bulk Download/Upload jobs move to true background execution (the POST handler
-- now returns as soon as the job row is created, and the actual work continues
-- after the response is sent) plus two new downloadable artifacts per job:
-- a plain-text log (every job type) and, for uploads, a re-uploadable workbook
-- containing only the ERROR rows with a Reason column, so a steward can fix the
-- flagged cells and re-submit the same file through the normal Upload flow.

ALTER TABLE bayanat.bulk_jobs
  ADD COLUMN IF NOT EXISTS log_file_data BYTEA,
  ADD COLUMN IF NOT EXISTS rejected_file_data BYTEA;
