-- Replaces the single exclusive "active provider" switch with independent
-- enable/disable toggles per provider. The login screen now lets the user pick
-- which configured method to authenticate with (LOCAL / LDAP / ...), and the
-- admin decides which methods are even offered, per db/111's design intent but
-- generalized past "exactly one active provider at a time."

ALTER TABLE bayanat.auth_settings
  ADD COLUMN IF NOT EXISTS local_enabled bool NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ldap_enabled  bool NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS oidc_enabled  bool NOT NULL DEFAULT false;

-- Backfill from the old single-select column so an environment that had
-- already configured+activated LDAP or OIDC keeps working after this migration.
UPDATE bayanat.auth_settings SET ldap_enabled = true WHERE provider_type_code = 'LDAP';
UPDATE bayanat.auth_settings SET oidc_enabled = true WHERE provider_type_code = 'OIDC';

ALTER TABLE bayanat.auth_settings DROP COLUMN IF EXISTS provider_type_code;
