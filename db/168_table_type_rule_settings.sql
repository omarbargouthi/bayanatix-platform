-- 168: table type rules as configuration.
-- The keywords, points per signal, size limits and confidence gaps a crawl uses to
-- suggest a table's type (Master / Transactional / Reference / Setup / System) were
-- constants in the crawler. They are now one row of settings, edited under
-- Configuration > Table Type Rules. An empty object means "the defaults", which live in
-- lib/table-type-rules.ts and reproduce the previous behaviour exactly.
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS bayanat.table_type_rule_settings (
  settings_id        integer PRIMARY KEY DEFAULT 1 CHECK (settings_id = 1),
  config_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by_user_id varchar(100),
  updated_at         timestamp NOT NULL DEFAULT now()
);

INSERT INTO bayanat.table_type_rule_settings (settings_id) VALUES (1) ON CONFLICT (settings_id) DO NOTHING;

COMMIT;
