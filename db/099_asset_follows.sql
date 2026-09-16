-- Migration 099: Follow an asset -> its activity (and its children's activity)
-- surfaces on the follower's Homepage.
-- =====================================================================

CREATE TABLE IF NOT EXISTS bayanat.asset_follows (
  follow_id       SERIAL PRIMARY KEY,
  user_id         VARCHAR(255) NOT NULL REFERENCES bayanat.users(user_id) ON DELETE CASCADE,
  asset_type_code VARCHAR(50)  NOT NULL,
  asset_id        INT          NOT NULL,
  followed_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, asset_type_code, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_asset_follows_user  ON bayanat.asset_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_follows_asset ON bayanat.asset_follows(asset_type_code, asset_id);

-- Singleton config (same pattern as bayanat.enrichment_settings /
-- bayanat.sample_data_settings) — Follow at the Table level is always on;
-- Schema/Source level default OFF since following either fans out to every
-- table and column underneath, which can mean a lot of activity noise on a
-- follower's Homepage. An admin opts each level in from Admin > Configuration.
CREATE TABLE IF NOT EXISTS bayanat.follow_settings (
  settings_id            INT PRIMARY KEY DEFAULT 1,
  schema_follow_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  source_follow_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT follow_settings_single_row CHECK (settings_id = 1)
);
INSERT INTO bayanat.follow_settings (settings_id) VALUES (1) ON CONFLICT (settings_id) DO NOTHING;
