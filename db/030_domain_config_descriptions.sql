-- Add English and Arabic description fields to the domain config table.
-- These are shown on the domain tiles in the dashboard when switching languages.

ALTER TABLE bayanat.gov_compliance_domain_config
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS description_ar TEXT;
