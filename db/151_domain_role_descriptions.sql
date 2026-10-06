-- Domain manage roles no longer grant access directly (the Manage Access panel is gone
-- from every domain page): they approve access requests for their domain; an
-- administrator assigns the roles. Descriptions updated to say so.
UPDATE bayanat.roles SET description = 'Full management of the Data Governance domain (framework, registers, compliance). Approves requests for access to the Data Governance domain.'
WHERE role_name = 'Data Governance Compliance';
UPDATE bayanat.roles SET description = 'Full management of the Data Quality domain. Approves requests for access to the Data Quality domain.'
WHERE role_name = 'Data Quality';
UPDATE bayanat.roles SET description = 'Full management of Data Sharing, FOI and Open Data together. Approves requests for access to any of the three.'
WHERE role_name = 'Open Data & Access';
UPDATE bayanat.roles SET description = 'Read-only access to one of Data Sharing / FOI / Open Data (per sub-domain), assigned by an administrator or through an approved access request.'
WHERE role_name = 'Open Data & Access (Read)';
