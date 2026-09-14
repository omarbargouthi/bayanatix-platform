-- Bulk Upload now auto-commits (no manual review/approve step) as a fully
-- background job, so the Jobs UI needs real progress (rows processed / total)
-- instead of just a RUNNING/COMMITTED binary state.

ALTER TABLE bayanat.bulk_jobs
  ADD COLUMN IF NOT EXISTS progress_processed int4,
  ADD COLUMN IF NOT EXISTS progress_total int4;
