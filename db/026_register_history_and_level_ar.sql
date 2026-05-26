-- 026: DG register entry history + Arabic names for compliance levels

-- History tracking for register entries
CREATE TABLE IF NOT EXISTS bayanat.gov_register_entry_history (
  history_id  SERIAL PRIMARY KEY,
  register_id INT NOT NULL,
  entry_id    INT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('CREATE','UPDATE','DELETE')),
  changed_by  TEXT,
  changed_at  TIMESTAMPTZ DEFAULT NOW(),
  old_data    JSONB,
  new_data    JSONB
);

CREATE INDEX IF NOT EXISTS gov_reg_entry_hist_reg_idx
  ON bayanat.gov_register_entry_history (register_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS gov_reg_entry_hist_entry_idx
  ON bayanat.gov_register_entry_history (entry_id, changed_at DESC);

-- Arabic name/description for maturity levels
ALTER TABLE bayanat.gov_compliance_level_config
  ADD COLUMN IF NOT EXISTS name_ar        TEXT,
  ADD COLUMN IF NOT EXISTS description_ar TEXT;
