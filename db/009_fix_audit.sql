-- ================================================================
-- 009_fix_audit.sql
-- • Drops broken row-level triggers (fn_audit_metadata_changes
--   referenced audit_logs / history_logs without bayanat. prefix,
--   and also assumed a column named "id"). Auditing is now handled
--   in the application layer, which records the real user and
--   avoids duplicate entries.
-- • Adds business_app_name to data_sources for source-level tagging.
-- ================================================================

-- Drop the broken DB-level triggers; app layer owns auditing now
DROP TRIGGER IF EXISTS trg_audit_data_attributes    ON bayanat.data_attributes;
DROP TRIGGER IF EXISTS trg_audit_business_glossaries ON bayanat.business_glossaries;

-- Add business application name column to data_sources
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'bayanat' AND table_name = 'data_sources'
      AND column_name = 'business_app_name'
  ) THEN
    ALTER TABLE bayanat.data_sources ADD COLUMN business_app_name varchar(150) NULL;
  END IF;
END$$;
