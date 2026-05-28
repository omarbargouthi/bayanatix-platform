-- 027: English content columns for compliance requirements

ALTER TABLE bayanat.gov_compliance_requirements
  ADD COLUMN IF NOT EXISTS question_en            TEXT,
  ADD COLUMN IF NOT EXISTS supporting_evidence_en TEXT,
  ADD COLUMN IF NOT EXISTS admission_criteria_en  TEXT,
  ADD COLUMN IF NOT EXISTS management_sector_en   TEXT,
  ADD COLUMN IF NOT EXISTS domain_en              TEXT,
  ADD COLUMN IF NOT EXISTS directory_type_en      TEXT;
