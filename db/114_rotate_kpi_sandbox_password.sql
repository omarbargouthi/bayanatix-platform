-- Rotates bayanatix_kpi_readonly's password on installs where it was already
-- created by db/071_reports_extended.sql's original hardcoded literal
-- ('kpi_sandbox_readonly_pw', committed in that file's git history and
-- publicly visible). db/071 no longer hardcodes a password for *new* installs
-- (it now uses the same __KPI_SANDBOX_ROLE_PASSWORD__ placeholder as this
-- file), but that doesn't change the password on a database where the role
-- already exists — this migration is what actually rotates it there. Requires
-- KPI_SANDBOX_ROLE_PASSWORD in .env.local (see scripts/migrate.mjs); safe/idempotent
-- to run again with the same value.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bayanatix_kpi_readonly') THEN
    ALTER ROLE bayanatix_kpi_readonly PASSWORD '__KPI_SANDBOX_ROLE_PASSWORD__';
  END IF;
END
$$;
