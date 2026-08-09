-- KSA Regulations: groups multiple compliance frameworks (NDI, PDPL, DCC, CST)
-- under one umbrella, with an admin-controlled "applicable to this
-- organization" toggle per framework.

CREATE TABLE IF NOT EXISTS bayanat.regulation_groups (
  group_code     varchar(50) PRIMARY KEY,
  group_name_en  varchar(200) NOT NULL,
  group_name_ar  varchar(200)
);
INSERT INTO bayanat.regulation_groups (group_code, group_name_en, group_name_ar)
VALUES ('KSA_REGULATIONS', 'KSA Regulations', 'اللوائح السعودية')
ON CONFLICT (group_code) DO NOTHING;

DO $$ BEGIN
  ALTER TABLE bayanat.gov_compliance_frameworks
    ADD COLUMN regulation_group_code varchar(50) REFERENCES bayanat.regulation_groups(group_code);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bayanat.gov_compliance_frameworks
    ADD COLUMN is_applicable_indicator bool NOT NULL DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

UPDATE bayanat.gov_compliance_frameworks
SET regulation_group_code = 'KSA_REGULATIONS'
WHERE code = 'NDI_2026' AND regulation_group_code IS NULL;
