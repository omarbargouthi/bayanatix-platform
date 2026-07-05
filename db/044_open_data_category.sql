-- Migration 044: add category_text to open_datasets (replaces domain_code in the UI)
ALTER TABLE bayanat.open_datasets
  ADD COLUMN IF NOT EXISTS category_text VARCHAR(200);
