-- Migration 036: Add domain weight and level range to compliance config
-- Domain weight (%) used for maturity score calculation
ALTER TABLE bayanat.gov_compliance_domain_config
  ADD COLUMN IF NOT EXISTS weight NUMERIC(5,2) DEFAULT NULL;

-- Level range: score range that maps to each maturity level
ALTER TABLE bayanat.gov_compliance_level_config
  ADD COLUMN IF NOT EXISTS range_from NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS range_to   NUMERIC(5,2) DEFAULT NULL;
