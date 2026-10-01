-- PIPEDA (framework_id 28) was imported before importRequirements() wrote the
-- canonical *_en columns (see the fix alongside this migration) -- it has
-- real content in the legacy req_text/supporting_evidence/etc. columns (all
-- genuinely English, built from official PIPEDA government sources this
-- session) but question_en and friends were all NULL. That's why its rows
-- showed correctly in Maturity Index Setup's list view (which falls back to
-- the legacy column) but blank in the edit form (which reads only *_en).
--
-- Safe to backfill directly: PIPEDA's legacy-column text IS English already
-- (confirmed -- this isn't an Arabic-native framework like NDI, where the
-- *_en columns hold a genuinely separate translation, not a duplicate).

UPDATE bayanat.gov_compliance_requirements SET
  question_en             = COALESCE(question_en, req_text),
  supporting_evidence_en  = COALESCE(supporting_evidence_en, supporting_evidence),
  admission_criteria_en   = COALESCE(admission_criteria_en, admission_criteria),
  management_sector_en    = COALESCE(management_sector_en, management_sector),
  directory_type_en       = COALESCE(directory_type_en, directory_type)
WHERE framework_id = 28;
