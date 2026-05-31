-- System-wide key/value configuration table
CREATE TABLE IF NOT EXISTS bayanat.system_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed: second language defaults to Arabic
INSERT INTO bayanat.system_config (key, value)
  VALUES ('secondary_language', 'ar')
  ON CONFLICT (key) DO NOTHING;
