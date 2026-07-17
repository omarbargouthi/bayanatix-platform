-- Migration 049: Switch open_datasets category from app_lookups code to
-- data_categories foreign key, so Open Data shares the same category table
-- as Privacy and Retention.

-- Add FK column
ALTER TABLE bayanat.open_datasets
  ADD COLUMN IF NOT EXISTS category_id INT REFERENCES bayanat.data_categories(category_id);

-- Drop the short-lived category_code column (added in 048, never used in prod)
ALTER TABLE bayanat.open_datasets
  DROP COLUMN IF EXISTS category_code;
