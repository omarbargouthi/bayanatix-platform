-- =====================================================
-- Migration 126: Customer logo branding (singleton settings row)
-- =====================================================
-- Same singleton-row pattern as bayanat.follow_settings (db/099) — logo bytes
-- stored as bytea (same convention as bulk_jobs.file_data / background_jobs.
-- result_file_data) rather than written to the filesystem, so it survives a
-- serverless/ephemeral-disk deployment target.

CREATE TABLE IF NOT EXISTS bayanat.branding_settings (
  settings_id    INT PRIMARY KEY DEFAULT 1,
  logo_data      BYTEA        NULL,
  logo_mime_type VARCHAR(50)  NULL,
  logo_filename  TEXT         NULL,
  updated_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT branding_settings_single_row CHECK (settings_id = 1)
);
INSERT INTO bayanat.branding_settings (settings_id) VALUES (1) ON CONFLICT (settings_id) DO NOTHING;
