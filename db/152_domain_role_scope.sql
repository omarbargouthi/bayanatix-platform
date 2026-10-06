-- Domain roles apply to a domain, not to a data source / schema / table. Each domain
-- role now names its domain(s), so assigning one always produces resource_type =
-- 'DOMAIN' rows (what lib/can.ts getDomainAccess checks) regardless of what the
-- Assign Role dialog's scope was. Existing assignments saved with a data scope
-- (GLOBAL etc.) never took effect — converted here.

ALTER TABLE bayanat.roles ADD COLUMN IF NOT EXISTS domain_codes text[];

UPDATE bayanat.roles SET domain_codes = ARRAY['GOVERNANCE']   WHERE role_name IN ('Data Governance Compliance', 'Data Governance (Read)');
UPDATE bayanat.roles SET domain_codes = ARRAY['DATA_QUALITY'] WHERE role_name IN ('Data Quality', 'Data Quality (Read)');
UPDATE bayanat.roles SET domain_codes = ARRAY['DATA_PRIVACY'] WHERE role_name IN ('Data Privacy Manager', 'Data Privacy', 'Data Privacy (Read)');
UPDATE bayanat.roles SET domain_codes = ARRAY['SHARING', 'FOI', 'OPEN_DATA'] WHERE role_name IN ('Open Data & Access', 'Open Data & Access (Read)');

-- Convert mis-scoped assignments of domain roles: one DOMAIN row per domain of the role.
INSERT INTO bayanat.role_assignments (role_id, user_id, team_id, resource_type, resource_id, resource_name)
SELECT DISTINCT ra.role_id, ra.user_id, ra.team_id, 'DOMAIN', d.code,
       CASE d.code WHEN 'GOVERNANCE' THEN 'Data Governance' WHEN 'DATA_QUALITY' THEN 'Data Quality' WHEN 'DATA_PRIVACY' THEN 'Data Privacy'
                   WHEN 'SHARING' THEN 'Data Sharing' WHEN 'FOI' THEN 'FOI Requests' WHEN 'OPEN_DATA' THEN 'Open Data' END
FROM bayanat.role_assignments ra
JOIN bayanat.roles r ON r.role_id = ra.role_id AND r.domain_codes IS NOT NULL
CROSS JOIN LATERAL unnest(r.domain_codes) AS d(code)
WHERE ra.resource_type <> 'DOMAIN'
  AND NOT EXISTS (
    SELECT 1 FROM bayanat.role_assignments x
    WHERE x.role_id = ra.role_id AND x.resource_type = 'DOMAIN' AND x.resource_id = d.code
      AND x.user_id IS NOT DISTINCT FROM ra.user_id AND x.team_id IS NOT DISTINCT FROM ra.team_id
  );

DELETE FROM bayanat.role_assignments ra
USING bayanat.roles r
WHERE r.role_id = ra.role_id AND r.domain_codes IS NOT NULL AND ra.resource_type <> 'DOMAIN';

-- Friendly names on any DOMAIN rows that still show the raw code.
UPDATE bayanat.role_assignments SET resource_name =
  CASE resource_id WHEN 'GOVERNANCE' THEN 'Data Governance' WHEN 'DATA_QUALITY' THEN 'Data Quality' WHEN 'DATA_PRIVACY' THEN 'Data Privacy'
                   WHEN 'SHARING' THEN 'Data Sharing' WHEN 'FOI' THEN 'FOI Requests' WHEN 'OPEN_DATA' THEN 'Open Data' ELSE resource_name END
WHERE resource_type = 'DOMAIN' AND resource_name = resource_id;
