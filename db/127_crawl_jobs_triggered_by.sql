-- =====================================================
-- Migration 127: Track who triggered a crawl (for job-completion notifications)
-- =====================================================
-- crawl_jobs had no user reference at all — unlike bayanat.background_jobs
-- (created_by_user_id) and bayanat.bulk_jobs (created_by_user_id), so there
-- was no one to notify when a crawl finished. Nullable: a scheduler-triggered
-- crawl (scripts/scheduler.mjs's tick) has no real user, and simply notifies
-- no one in that case.

ALTER TABLE bayanat.crawl_jobs
  ADD COLUMN IF NOT EXISTS triggered_by_user_id TEXT NULL;
