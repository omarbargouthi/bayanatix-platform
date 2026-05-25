-- Migration 024: Compliance assessment enhancements
-- 1. Editable management notes (override of imported management_sector)
ALTER TABLE bayanat.gov_compliance_assessments
  ADD COLUMN IF NOT EXISTS management_notes TEXT;

-- 2. Change history for all compliance assessment field changes
CREATE TABLE IF NOT EXISTS bayanat.gov_compliance_history (
  history_id   SERIAL PRIMARY KEY,
  req_id       INTEGER NOT NULL REFERENCES bayanat.gov_compliance_requirements(req_id) ON DELETE CASCADE,
  framework_id INTEGER NOT NULL,
  field_name   TEXT    NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  changed_by   TEXT    NOT NULL,
  changed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gov_compliance_history_req_idx
  ON bayanat.gov_compliance_history(req_id, changed_at DESC);
