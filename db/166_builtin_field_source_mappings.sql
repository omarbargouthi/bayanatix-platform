-- 166: fill built-in descriptive fields from the source system during a crawl.
-- Custom attributes can already be mapped to a SQL Server extended property or to a
-- "key: value" inside a table / column comment (db/141). The same is now possible for
-- four built-in fields:
--   TABLE_TYPE     table   Master / Transactional / Reference / Staging / Reporting
--   COLUMN_TYPE    column  Business / Technical
--   FRIENDLY_NAME  column  the column's friendly name
--   ENCRYPTED      column  the Encrypted flag
-- A value is applied only when it matches what Bayanis defines for the field (a table
-- type that is not one of Bayanis's table types is skipped and reported in the crawl log).
-- source_synced_json remembers which fields currently hold a value that came from the
-- source, so the pages can say so.
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS bayanat.builtin_field_source_mappings (
  mapping_id         serial PRIMARY KEY,
  field_code         varchar(30)  NOT NULL CHECK (field_code IN ('TABLE_TYPE', 'COLUMN_TYPE', 'FRIENDLY_NAME', 'ENCRYPTED')),
  source_type_code   varchar(20)  NOT NULL CHECK (source_type_code IN ('MSSQL', 'POSTGRES', 'ORACLE', 'MYSQL')),
  method_code        varchar(20)  NOT NULL CHECK (method_code IN ('EXTENDED_PROPERTY', 'COMMENT_KEY')),
  source_key_text    varchar(128) NOT NULL,
  created_by_user_id varchar(100),
  created_at         timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (field_code, source_type_code),
  -- Extended properties exist on SQL Server only; elsewhere the value is a key in the comment.
  CHECK (method_code = 'COMMENT_KEY' OR source_type_code = 'MSSQL')
);

ALTER TABLE bayanat.data_entities   ADD COLUMN IF NOT EXISTS source_synced_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE bayanat.data_attributes ADD COLUMN IF NOT EXISTS source_synced_json jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
