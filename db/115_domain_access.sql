-- ─────────────────────────────────────────────────────────────────────────────
-- 115_domain_access.sql
-- Domain-level RBAC: gates whole feature domains (Governance, Data Quality,
-- Data Privacy, Data Sharing, FOI, Open Data) behind role_assignments, reusing
-- the existing fine-grained RBAC (bayanat.roles / bayanat.role_assignments)
-- rather than introducing a parallel system. Adds a new resource_type='DOMAIN'
-- whose resource_id is one of a fixed set of domain codes (GOVERNANCE,
-- DATA_QUALITY, DATA_PRIVACY, SHARING, FOI, OPEN_DATA), and two new role
-- privilege columns (domain_write = manage the domain + can delegate read
-- access into it; domain_read = view-only) alongside the existing
-- metadata_read/write/delete, data_read, pii_clear_text_allowed columns.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE bayanat.roles
  ADD COLUMN IF NOT EXISTS domain_write BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS domain_read  BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE bayanat.role_assignments
  DROP CONSTRAINT IF EXISTS role_assignments_resource_type_check;
ALTER TABLE bayanat.role_assignments
  ADD CONSTRAINT role_assignments_resource_type_check
    CHECK (resource_type IN ('GLOBAL','DATA_SOURCE','SCHEMA','TABLE','DOMAIN'));

-- ── Seed domain roles ──────────────────────────────────────────────────────────
INSERT INTO bayanat.roles (role_name, description, domain_write, domain_read) VALUES
    ('Data Governance Compliance', 'Full management of the Data Governance domain (framework, registers, compliance) and may grant other users read-only access to it.', TRUE, FALSE),
    ('Data Governance (Read)',     'Read-only access to the Data Governance domain.', FALSE, TRUE),
    ('Data Quality',               'Full management of the Data Quality domain and may grant other users read-only access to it.', TRUE, FALSE),
    ('Data Quality (Read)',        'Read-only access to the Data Quality domain.', FALSE, TRUE),
    ('Data Privacy',               'Full management of the Data Privacy domain. Delegated access is read-only only.', TRUE, FALSE),
    ('Data Privacy (Read)',        'Read-only access to the Data Privacy domain.', FALSE, TRUE),
    ('Open Data & Access',         'Full management of Data Sharing, FOI, and Open Data together, and may grant other users read-only access to any of the three individually.', TRUE, FALSE),
    ('Open Data & Access (Read)',  'Read-only access to one of Data Sharing / FOI / Open Data (granted per sub-domain).', FALSE, TRUE)
ON CONFLICT (role_name) DO NOTHING;
