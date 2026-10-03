-- Privacy hardening (Privacy by Design):
--  * Data access log — every view of live sample data, recording whether
--    personal-data columns were shown masked or in clear text.
--  * attribute_profile.values_masked — profile min/max/top values of personal-data
--    columns are not kept (lib/privacy/pi-housekeeping.ts); the flag lets the UI
--    say "hidden — personal data" instead of an unexplained blank.
-- Connection passwords are encrypted in place (enc:v1:… in password_text, see
-- lib/secrets.ts and scripts/encrypt-connection-passwords.mts) — no schema change.

CREATE TABLE IF NOT EXISTS bayanat.data_access_log (
  access_id         bigserial PRIMARY KEY,
  user_id           varchar(100) NOT NULL,
  access_type_code  varchar(20) NOT NULL CHECK (access_type_code IN ('SAMPLE_VIEW')),
  asset_type_code   varchar(20) NOT NULL,
  asset_id          integer NOT NULL,
  pi_column_count   integer NOT NULL DEFAULT 0,
  clear_text        boolean NOT NULL DEFAULT false,  -- personal-data columns shown unmasked
  clear_text_basis  varchar(20),                     -- GRANT (approved PI clear-text request) | ADMIN
  row_count         integer,
  ip_address_text   varchar(45),
  user_agent_text   text,
  accessed_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_data_access_log_time ON bayanat.data_access_log (accessed_at DESC);
CREATE INDEX IF NOT EXISTS ix_data_access_log_asset ON bayanat.data_access_log (asset_type_code, asset_id);

ALTER TABLE bayanat.attribute_profile ADD COLUMN IF NOT EXISTS values_masked boolean NOT NULL DEFAULT false;
