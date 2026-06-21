-- Soft delete support for registers
ALTER TABLE bayanat.gov_registers
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  TEXT;

-- Column change log for legal reference (archived before deletion)
CREATE TABLE IF NOT EXISTS bayanat.gov_register_column_log (
  log_id         SERIAL PRIMARY KEY,
  register_id    INT  NOT NULL,
  column_id      INT,
  column_name    TEXT NOT NULL,
  column_key     TEXT NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('CREATED','DELETED')),
  affected_count INT  DEFAULT 0,
  archived_data  JSONB,
  changed_by     TEXT,
  changed_at     TIMESTAMPTZ DEFAULT NOW()
);
