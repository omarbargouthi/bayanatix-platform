-- ================================================================
-- 008_metadata_edit.sql — Metadata editing support
-- Adds: is_encrypted on data_attributes, term_type on
-- business_glossaries, and new reference codes (TOP_SECRET,
-- PERSONAL, HEALTH PI categories).
-- Safe to run multiple times (all operations are idempotent).
-- ================================================================

DO $$
BEGIN
  -- Encryption flag for individual columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'bayanat' AND table_name = 'data_attributes'
      AND column_name = 'is_encrypted'
  ) THEN
    ALTER TABLE bayanat.data_attributes
      ADD COLUMN is_encrypted boolean NOT NULL DEFAULT false;
  END IF;

  -- Term type for glossary entries: TERM (default) or KPI_METRIC
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'bayanat' AND table_name = 'business_glossaries'
      AND column_name = 'term_type'
  ) THEN
    ALTER TABLE bayanat.business_glossaries
      ADD COLUMN term_type varchar(20) NOT NULL DEFAULT 'TERM';
  END IF;
END$$;

-- Additional classification level
INSERT INTO bayanat.classification_types (class_code, class_name_text)
VALUES ('TOP_SECRET', 'Top Secret')
ON CONFLICT (class_code) DO NOTHING;

-- Additional PI categories (CONTACT + FINANCIAL already exist from seed 005)
INSERT INTO bayanat.pi_category_types (category_code, category_name_text)
VALUES
  ('PERSONAL', 'Personal Information'),
  ('HEALTH',   'Health Information')
ON CONFLICT (category_code) DO NOTHING;
