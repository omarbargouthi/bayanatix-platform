-- ─────────────────────────────────────────────────────────────────────────────
-- 006_user_management.sql
-- Fine-grained RBAC: roles, teams, team membership, resource-level assignments.
-- "System role" on bayanat.users stays separate (UI access level).
-- These tables govern what data assets each user/team can see or edit.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Roles ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.roles (
    role_id          SERIAL       PRIMARY KEY,
    role_name        TEXT         NOT NULL UNIQUE,
    description      TEXT,
    -- Metadata privileges
    metadata_read    BOOLEAN      NOT NULL DEFAULT FALSE,
    metadata_write   BOOLEAN      NOT NULL DEFAULT FALSE,
    metadata_delete  BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Data privilege (table row preview only)
    data_read        BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Full platform admin
    is_admin         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Teams ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.teams (
    team_id     SERIAL      PRIMARY KEY,
    team_name   TEXT        NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Team membership ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.team_members (
    team_id   INT         NOT NULL REFERENCES bayanat.teams(team_id)   ON DELETE CASCADE,
    user_id   TEXT        NOT NULL REFERENCES bayanat.users(user_id)   ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

-- ── Role assignments ──────────────────────────────────────────────────────────
-- One row = one role granted to one user (or team) scoped to a resource.
-- resource_type: GLOBAL | DATA_SOURCE | SCHEMA | TABLE
-- resource_id  : NULL for GLOBAL; otherwise the PK of the resource cast to TEXT
CREATE TABLE IF NOT EXISTS bayanat.role_assignments (
    assignment_id SERIAL       PRIMARY KEY,
    role_id       INT          NOT NULL REFERENCES bayanat.roles(role_id) ON DELETE CASCADE,
    -- Assignee — exactly one of these must be set
    user_id       TEXT         REFERENCES bayanat.users(user_id) ON DELETE CASCADE,
    team_id       INT          REFERENCES bayanat.teams(team_id) ON DELETE CASCADE,
    -- Scope
    resource_type TEXT         NOT NULL DEFAULT 'GLOBAL'
                               CHECK (resource_type IN ('GLOBAL','DATA_SOURCE','SCHEMA','TABLE')),
    resource_id   TEXT,        -- NULL for GLOBAL
    resource_name TEXT,        -- display label cached at assignment time
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ra_assignee CHECK (
        (user_id IS NOT NULL AND team_id IS NULL) OR
        (user_id IS NULL AND team_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS ra_user_idx  ON bayanat.role_assignments (user_id)  WHERE user_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS ra_team_idx  ON bayanat.role_assignments (team_id)  WHERE team_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS ra_role_idx  ON bayanat.role_assignments (role_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DATA
-- ─────────────────────────────────────────────────────────────────────────────

-- Default roles
INSERT INTO bayanat.roles (role_name, description, metadata_read, metadata_write, metadata_delete, data_read, is_admin) VALUES
    ('Platform Admin',
     'Full platform administration — create users, manage roles, edit all metadata and view data.',
     TRUE, TRUE, TRUE, TRUE, TRUE),
    ('Data Steward',
     'Can read and update metadata across assigned assets. Cannot delete or view raw data.',
     TRUE, TRUE, FALSE, FALSE, FALSE),
    ('Metadata Viewer',
     'Read-only access to metadata — descriptions, classifications, lineage, quality scores.',
     TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Data Analyst',
     'Can read metadata and preview table data. No write access.',
     TRUE, FALSE, FALSE, TRUE, FALSE),
    ('Compliance Officer',
     'Can read and write classification and privacy metadata. Can view data for audit purposes.',
     TRUE, TRUE, FALSE, TRUE, FALSE);

-- Teams
INSERT INTO bayanat.teams (team_name, description) VALUES
    ('Finance Team',     'Owns and governs AR/AP financial data assets.'),
    ('Governance Team',  'Central data governance office responsible for policy and compliance.'),
    ('Analytics Team',   'Consumes data assets for BI and reporting.');

-- Team members
INSERT INTO bayanat.team_members (team_id, user_id) VALUES
    (1, 'khaled.almansour'),
    (1, 'fahad.harbi'),
    (2, 'sara.alqahtani'),
    (2, 'mohammed.nasser'),
    (3, 'fahad.harbi');

-- Role assignments
-- sara = Platform Admin globally
INSERT INTO bayanat.role_assignments (role_id, user_id, resource_type, resource_id, resource_name)
    SELECT r.role_id, 'sara.alqahtani', 'GLOBAL', NULL, 'Global'
    FROM bayanat.roles r WHERE r.role_name = 'Platform Admin';

-- khaled = Data Steward on AR_SCHEMA (schema_id=1)
INSERT INTO bayanat.role_assignments (role_id, user_id, resource_type, resource_id, resource_name)
    SELECT r.role_id, 'khaled.almansour', 'SCHEMA', '1', 'AR_SCHEMA'
    FROM bayanat.roles r WHERE r.role_name = 'Data Steward';

-- mohammed = Compliance Officer on PostgreSQL Production (source_id=1)
INSERT INTO bayanat.role_assignments (role_id, user_id, resource_type, resource_id, resource_name)
    SELECT r.role_id, 'mohammed.nasser', 'DATA_SOURCE', '1', 'PostgreSQL Production'
    FROM bayanat.roles r WHERE r.role_name = 'Compliance Officer';

-- fahad = Metadata Viewer on AR_INVOICES table (entity_id=1)
INSERT INTO bayanat.role_assignments (role_id, user_id, resource_type, resource_id, resource_name)
    SELECT r.role_id, 'fahad.harbi', 'TABLE', '1', 'AR_INVOICES'
    FROM bayanat.roles r WHERE r.role_name = 'Metadata Viewer';

-- Finance Team = Data Steward on AR_SCHEMA
INSERT INTO bayanat.role_assignments (role_id, team_id, resource_type, resource_id, resource_name)
    SELECT r.role_id, t.team_id, 'SCHEMA', '1', 'AR_SCHEMA'
    FROM bayanat.roles r, bayanat.teams t
    WHERE r.role_name = 'Data Steward' AND t.team_name = 'Finance Team';

-- Analytics Team = Data Analyst on PostgreSQL Production
INSERT INTO bayanat.role_assignments (role_id, team_id, resource_type, resource_id, resource_name)
    SELECT r.role_id, t.team_id, 'DATA_SOURCE', '1', 'PostgreSQL Production'
    FROM bayanat.roles r, bayanat.teams t
    WHERE r.role_name = 'Data Analyst' AND t.team_name = 'Analytics Team';
