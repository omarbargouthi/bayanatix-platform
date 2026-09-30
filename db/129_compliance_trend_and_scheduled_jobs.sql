-- =====================================================
-- Migration 129: Per-framework compliance trend history +
-- area-level scheduling config (Reports, Regulation)
-- =====================================================
-- Deliberately separate from bayanat.crawl_config.schedule_cron (migration 125)
-- and bayanat.dq_rules.schedule_cron (migration 020) -- those are per-row
-- schedules (one connection, one rule) polled by /api/admin/sources/scheduled-crawl
-- and /api/dq/scheduled-run, and this migration does not touch either. This is
-- for jobs that aren't tied to one row -- Reports KPI snapshot capture and
-- Regulation maturity/compliance trend capture -- so they get one schedule per
-- AREA instead, editable from Admin > Configuration > Scheduling.

CREATE TABLE IF NOT EXISTS bayanat.compliance_trends (
  trend_id        SERIAL PRIMARY KEY,
  framework_id    INT NOT NULL REFERENCES bayanat.gov_compliance_frameworks(framework_id) ON DELETE CASCADE,
  period_date     DATE NOT NULL,           -- first-of-month the snapshot represents
  compliance_pct  NUMERIC(5,2) NOT NULL,
  req_count       INT NOT NULL,
  complete_count  INT NOT NULL,
  captured_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (framework_id, period_date)
);

CREATE TABLE IF NOT EXISTS bayanat.scheduled_job_areas (
  area_code      TEXT PRIMARY KEY,   -- 'REPORTS_SNAPSHOT' | 'REGULATION_TREND'
  schedule_cron  VARCHAR(100) NOT NULL,
  is_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at    TIMESTAMP NULL,
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO bayanat.scheduled_job_areas (area_code, schedule_cron) VALUES
  ('REPORTS_SNAPSHOT', '0 2 1 * *'),
  ('REGULATION_TREND', '0 2 1 * *')
ON CONFLICT (area_code) DO NOTHING;
