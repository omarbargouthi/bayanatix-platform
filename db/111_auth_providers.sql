-- Configurable authentication providers (LOCAL / LDAP / OIDC) + auto-provisioning
-- of externally-authenticated users into a read-only "Viewer" role. Each deployed
-- customer picks exactly one external provider (or stays LOCAL); LOCAL email+password
-- login always stays available too, as an admin escape hatch that can't be locked out.
--
-- Secrets (LDAP bind password, OIDC client secret) are stored the same way
-- bayanat.llm_credentials already does it — AES-256-GCM, app-level key, write-only
-- (see lib/secrets.ts) — rather than inventing a second secrets pattern.

-- ── 1. users: support externally-authenticated accounts ─────────────────────────
-- password_hash becomes optional (LDAP/OIDC accounts have no local password to
-- verify against); auth_provider_code records how the account was created/logs in,
-- so the login route can refuse local-password login for an externally-sourced
-- account even if a stale password_hash somehow exists.

ALTER TABLE bayanat.users
  ALTER COLUMN password_hash DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS auth_provider_code varchar(10) NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS external_subject_text varchar(255);

DO $$ BEGIN
  ALTER TABLE bayanat.users
    ADD CONSTRAINT users_auth_provider_check CHECK (auth_provider_code IN ('LOCAL','LDAP','OIDC'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only meaningful for externally-provisioned accounts; lets provisioning look a
-- user back up by their stable IdP subject/DN even if their email later changes.
CREATE INDEX IF NOT EXISTS idx_users_external_subject ON bayanat.users(external_subject_text) WHERE external_subject_text IS NOT NULL;

-- ── 2. auth_settings — singleton config (same pattern as sit_settings / ────────
--       sample_data_settings). One row, id fixed at 1.

CREATE TABLE IF NOT EXISTS bayanat.auth_settings (
  id                            smallint PRIMARY KEY DEFAULT 1,
  provider_type_code            varchar(10) NOT NULL DEFAULT 'LOCAL',

  -- LDAP
  ldap_url_text                 varchar(255),
  ldap_use_starttls_indicator   bool NOT NULL DEFAULT false,
  ldap_bind_dn_text             varchar(255),
  ldap_bind_credential_id       int4,
  ldap_base_dn_text             varchar(255),
  ldap_user_filter_text         varchar(255) DEFAULT '(mail={{username}})',
  ldap_email_attr_text          varchar(50)  DEFAULT 'mail',
  ldap_name_attr_text           varchar(50)  DEFAULT 'displayName',

  -- OIDC
  oidc_issuer_url_text          varchar(500),
  oidc_client_id_text           varchar(255),
  oidc_client_credential_id     int4,
  oidc_redirect_uri_text        varchar(500),
  oidc_scopes_text              varchar(255) DEFAULT 'openid profile email',

  -- Auto-provisioning: which fine-grained role newly-seen external users are
  -- assigned (data_read/metadata_read scoped role), and where — NULL scope list
  -- means GLOBAL (all data sources); a non-empty array scopes to just those
  -- data_source_ids instead.
  auto_provision_role_id        int4 REFERENCES bayanat.roles(role_id) ON DELETE SET NULL,
  auto_provision_source_ids     int4[],

  updated_at                    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id            varchar(100),

  CONSTRAINT auth_settings_singleton CHECK (id = 1),
  CONSTRAINT auth_settings_provider_check CHECK (provider_type_code IN ('LOCAL','LDAP','OIDC'))
);

INSERT INTO bayanat.auth_settings (id, provider_type_code)
SELECT 1, 'LOCAL' WHERE NOT EXISTS (SELECT 1 FROM bayanat.auth_settings WHERE id = 1);

-- Credential FKs added after llm_credentials-style secret rows can exist for them;
-- reusing that same encrypted-secret table rather than duplicating it.
DO $$ BEGIN
  ALTER TABLE bayanat.auth_settings
    ADD CONSTRAINT auth_settings_ldap_cred_fkey FOREIGN KEY (ldap_bind_credential_id) REFERENCES bayanat.llm_credentials(credential_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE bayanat.auth_settings
    ADD CONSTRAINT auth_settings_oidc_cred_fkey FOREIGN KEY (oidc_client_credential_id) REFERENCES bayanat.llm_credentials(credential_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Seed a dedicated "External Viewer" fine-grained role ─────────────────────
-- Deliberately separate from the pre-existing "Metadata Viewer" (data_read=false)
-- and "Data Analyst" roles — auto-provisioning should never silently piggyback on
-- a role an admin might repurpose for something else. data_read+metadata_read,
-- no write/admin/PII-clear-text privileges.

INSERT INTO bayanat.roles (role_name, description, metadata_read, metadata_write, metadata_delete, data_read, is_admin, pii_clear_text_allowed)
SELECT 'External Viewer', 'Read-only metadata + data access, auto-assigned to users provisioned via LDAP/OIDC on first sign-in.', true, false, false, true, false, false
WHERE NOT EXISTS (SELECT 1 FROM bayanat.roles WHERE role_name = 'External Viewer');

UPDATE bayanat.auth_settings
SET auto_provision_role_id = (SELECT role_id FROM bayanat.roles WHERE role_name = 'External Viewer')
WHERE id = 1 AND auto_provision_role_id IS NULL;

-- ── 4. Login attempt tracking (basic rate limiting) ─────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.login_attempts (
  attempt_id      serial PRIMARY KEY,
  identifier_text varchar(255) NOT NULL,  -- email or "ip:x.x.x.x", whichever bucket
  succeeded       bool NOT NULL,
  attempted_at    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier_time ON bayanat.login_attempts(identifier_text, attempted_at);
