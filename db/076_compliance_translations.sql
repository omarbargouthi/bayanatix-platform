-- Bring Maturity Index Setup / Compliance content into Language Management
-- (data/coverage-tracking only — see plan; ComplianceClient.tsx and
-- MaturityIndexClient.tsx are NOT rewired to read from this, they keep
-- working exactly as before via their existing legacy columns).

-- translation_keys previously assumed every row's base_text was English.
-- gov_compliance_requirements is Arabic-native (the imported regulatory
-- source text) with an optional English sidecar — the reverse direction —
-- so a key needs to record what language its own base_text is actually in.
DO $$ BEGIN
  ALTER TABLE bayanat.translation_keys ADD COLUMN base_language_code varchar(10) NOT NULL DEFAULT 'en'
    REFERENCES bayanat.languages(language_code);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

ALTER TABLE bayanat.translation_categories DROP CONSTRAINT IF EXISTS translation_categories_domain_check;
ALTER TABLE bayanat.translation_categories
  ADD CONSTRAINT translation_categories_domain_check CHECK (domain_code IN ('UI','LIST','COMPLIANCE'));

INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('LIST_COMPLIANCE_LEVELS',  'Compliance Maturity Levels', 'LIST'),
  ('LIST_COMPLIANCE_DOMAINS', 'Compliance Domains',         'LIST'),
  ('LIST_COMPLIANCE_CONFIG',  'Compliance Status/Evidence/Type Labels', 'LIST'),
  ('COMPLIANCE_REQUIREMENTS', 'Compliance Requirement Text', 'COMPLIANCE')
ON CONFLICT (category_code) DO NOTHING;
