-- Migrate any CUSTODIAN assignments to TECH_STEWARD before removing the role
UPDATE bayanat.asset_stakeholders SET role_code = 'TECH_STEWARD'
WHERE role_code = 'CUSTODIAN'
  AND NOT EXISTS (
    SELECT 1 FROM bayanat.asset_stakeholders x
    WHERE x.asset_type_code = asset_stakeholders.asset_type_code
      AND x.asset_id        = asset_stakeholders.asset_id
      AND x.user_id         = asset_stakeholders.user_id
      AND x.role_code       = 'TECH_STEWARD'
  );

-- Remove any remaining duplicates created by the merge
DELETE FROM bayanat.asset_stakeholders WHERE role_code = 'CUSTODIAN';

-- Drop the CUSTODIAN role
DELETE FROM bayanat.stakeholder_roles WHERE role_code = 'CUSTODIAN';

-- Drop the default_custodian_user_id column from crawl_config (if it exists)
ALTER TABLE bayanat.crawl_config DROP COLUMN IF EXISTS default_custodian_user_id;
