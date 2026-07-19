-- Migration 056: fix catalog_class_code FK + add mapping-level collaboration thread

-- 1. Drop the FK on catalog_class_code — data_attributes uses its own codes
--    (PII, SENSITIVE, etc.) that don't exist in classification_types.
--    We keep it as plain VARCHAR so any catalog value can be stored.
ALTER TABLE bayanat.foi_attribute_mappings
  DROP CONSTRAINT IF EXISTS foi_attribute_mappings_catalog_class_code_fkey;

-- 2. Add mapping_id to foi_communications for per-mapping collaboration threads
ALTER TABLE bayanat.foi_communications
  ADD COLUMN IF NOT EXISTS mapping_id INT
    REFERENCES bayanat.foi_attribute_mappings(mapping_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_foi_comms_mapping ON bayanat.foi_communications(mapping_id)
  WHERE mapping_id IS NOT NULL;
