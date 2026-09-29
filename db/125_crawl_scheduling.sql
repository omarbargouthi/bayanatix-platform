-- =====================================================
-- Migration 125: Per-connection crawl scheduling
-- =====================================================
-- bayanat.dq_rules already got a schedule_cron column (+ last_run_at) in
-- migration 020, but nothing ever read it — /api/dq/scheduled-run (added
-- alongside this migration) is what actually starts using it now.
-- crawl_config had no schedule concept at all until this migration.

ALTER TABLE bayanat.crawl_config
  ADD COLUMN IF NOT EXISTS schedule_cron VARCHAR(100) NULL;
