-- 188: Keeping impact assessments current (lib/privacy/dpia-watch.ts).
--  * dpia_suggestions: assets the catalog says should be screened and are not covered by any
--    assessment yet (sensitive or large-scale personal data, shared outside, sent abroad, or a
--    processing activity that handles personal data).
--  * dpias.changes_json: what changed in the catalog since a screening, a submission or a
--    decision; baseline_facts_json is the point of comparison after an officer has looked at the
--    changes and found nothing material.
--  * Reminders when a review date arrives and when a measure becomes overdue, sent once.
--  * The daily check runs as the DPIA_WATCH scheduled area.
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS bayanat.dpia_suggestions (
  suggestion_id        bigserial PRIMARY KEY,
  asset_type_code      varchar(50) NOT NULL,
  asset_id             bigint NOT NULL,
  reason_codes         text[] NOT NULL DEFAULT '{}',
  reasons_json         jsonb NOT NULL DEFAULT '[]',
  status_code          varchar(20) NOT NULL DEFAULT 'OPEN' CHECK (status_code IN ('OPEN', 'DISMISSED', 'STARTED', 'RESOLVED')),
  dpia_id              bigint REFERENCES bayanat.dpias(dpia_id) ON DELETE SET NULL,
  first_seen_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at         timestamptz NOT NULL DEFAULT now(),
  dismissed_by_user_id varchar(100),
  dismissed_at         timestamptz,
  dismiss_note_text    text,
  dismissed_reasons    text[],
  UNIQUE (asset_type_code, asset_id)
);
CREATE INDEX IF NOT EXISTS dpia_suggestions_status_idx ON bayanat.dpia_suggestions (status_code);

ALTER TABLE bayanat.dpias ADD COLUMN IF NOT EXISTS changes_json jsonb;
ALTER TABLE bayanat.dpias ADD COLUMN IF NOT EXISTS changes_detected_at timestamptz;
ALTER TABLE bayanat.dpias ADD COLUMN IF NOT EXISTS baseline_facts_json jsonb;
ALTER TABLE bayanat.dpias ADD COLUMN IF NOT EXISTS review_reminded_on date;
ALTER TABLE bayanat.dpia_measures ADD COLUMN IF NOT EXISTS overdue_reminded_at timestamptz;

INSERT INTO bayanat.scheduled_job_areas (area_code, schedule_cron) VALUES ('DPIA_WATCH', '0 3 * * *')
ON CONFLICT (area_code) DO NOTHING;

COMMIT;
