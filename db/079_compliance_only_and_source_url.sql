-- PDPL/DCC/CST have no per-requirement maturity tier — they're a straight
-- compliance checklist, not a 0-5 maturity assessment like NDI. Lets
-- ComplianceClient.tsx skip the level-picker step entirely for these
-- frameworks instead of showing a single always-available "Level 0" card.
DO $$ BEGIN
  ALTER TABLE bayanat.gov_compliance_frameworks
    ADD COLUMN assessment_mode varchar(20) NOT NULL DEFAULT 'MATURITY';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

ALTER TABLE bayanat.gov_compliance_frameworks DROP CONSTRAINT IF EXISTS gov_compliance_frameworks_assessment_mode_check;
ALTER TABLE bayanat.gov_compliance_frameworks
  ADD CONSTRAINT gov_compliance_frameworks_assessment_mode_check CHECK (assessment_mode IN ('MATURITY', 'COMPLIANCE_ONLY'));

-- Governance Framework documents (Policy/Process/.../Regulatory) had no way
-- to link out to an official external artifact (e.g. the actual PDPL law
-- text) — only file attachments. Reference link, not a schema requirement.
DO $$ BEGIN
  ALTER TABLE bayanat.gov_framework_docs ADD COLUMN source_url text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
