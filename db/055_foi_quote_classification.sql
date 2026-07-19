-- Migration 055: Quote adjustment + classification coordination

-- 1. Quote manual adjustment fields
ALTER TABLE bayanat.foi_quotes
  ADD COLUMN IF NOT EXISTS adjustment_reason    TEXT,
  ADD COLUMN IF NOT EXISTS adjustment_approved  BOOLEAN;

-- 2. Attribute mapping: store catalog-read classification + steward coordination
ALTER TABLE bayanat.foi_attribute_mappings
  ADD COLUMN IF NOT EXISTS catalog_class_code          VARCHAR(20) REFERENCES bayanat.classification_types(class_code),
  ADD COLUMN IF NOT EXISTS steward_notified_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS steward_notification_notes  TEXT;
