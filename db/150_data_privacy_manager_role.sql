-- Domain access is granted by an administrator assigning the domain's role, and
-- access requests are approved by the holders of the domain's manage role:
--   Data Governance          → Data Governance Compliance
--   Data Privacy             → Data Privacy Manager   (was "Data Privacy")
--   Data Sharing / FOI / Open Data → Open Data & Access
--   Data Quality             → Data Quality
UPDATE bayanat.roles
SET role_name = 'Data Privacy Manager',
    description = 'Full management of the Data Privacy domain. Approves requests for access to the Data Privacy domain.'
WHERE role_name = 'Data Privacy'
  AND NOT EXISTS (SELECT 1 FROM bayanat.roles WHERE role_name = 'Data Privacy Manager');
