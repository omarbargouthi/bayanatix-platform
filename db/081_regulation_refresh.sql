-- 081: prep for the regulation-frameworks refresh import
-- (scripts/import-regulation-refresh.mjs). BCBS239 is an international banking
-- standard, not a Saudi regulation, so it gets its own regulation_groups entry
-- rather than being lumped into KSA_REGULATIONS. standard_ar is new: the
-- existing `standard` column has always held English only (no bilingual
-- tracking existed for it, unlike domain/domain_en + gov_compliance_domain_config)
-- but the refreshed source data has real, distinct Arabic sub-grouping names
-- worth keeping rather than dropping.

INSERT INTO bayanat.regulation_groups (group_code, group_name_en, group_name_ar)
VALUES ('INTERNATIONAL_STANDARDS', 'International Standards', 'المعايير الدولية')
ON CONFLICT (group_code) DO NOTHING;

ALTER TABLE bayanat.gov_compliance_requirements ADD COLUMN IF NOT EXISTS standard_ar text;
