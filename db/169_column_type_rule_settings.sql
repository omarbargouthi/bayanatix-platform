-- 169: column type rules as configuration.
-- The confidence each rule gives when it decides a column is Business or Technical,
-- the modifiers applied afterwards, the confidence bands and the hints that mark a
-- surrogate key were constants in lib/column-classifier.ts. They are now one row of
-- settings, edited under Configuration > Column Type Rules. An empty object means "the
-- defaults", which reproduce the previous behaviour exactly. (The name patterns were
-- already data: bayanat.classification_patterns, db/065.)
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS bayanat.column_type_rule_settings (
  settings_id        integer PRIMARY KEY DEFAULT 1 CHECK (settings_id = 1),
  config_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by_user_id varchar(100),
  updated_at         timestamp NOT NULL DEFAULT now()
);

INSERT INTO bayanat.column_type_rule_settings (settings_id) VALUES (1) ON CONFLICT (settings_id) DO NOTHING;

COMMIT;
