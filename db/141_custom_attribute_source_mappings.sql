-- Custom attributes filled from the source system during a crawl.
-- Per attribute and source type, where the value comes from:
--  * EXTENDED_PROPERTY — a named SQL Server extended property (SQL Server,
--    Azure SQL Managed Instance, Azure SQL Database): sys.extended_properties.
--  * COMMENT_KEY — a "key: value" pair (or JSON key) inside the table/column
--    comment — PostgreSQL / Oracle / MySQL COMMENT, or SQL Server MS_Description.
-- The source always wins; a value that changes on a later crawl is reported in
-- that table's METADATA_UPDATE review request (lib/crawler.ts).

CREATE TABLE IF NOT EXISTS bayanat.custom_attribute_source_mappings (
  mapping_id        serial PRIMARY KEY,
  attr_def_id       integer NOT NULL REFERENCES bayanat.custom_attribute_definitions(attr_def_id) ON DELETE CASCADE,
  source_type_code  varchar(20) NOT NULL CHECK (source_type_code IN ('MSSQL', 'POSTGRES', 'ORACLE', 'MYSQL')),
  method_code       varchar(20) NOT NULL CHECK (method_code IN ('EXTENDED_PROPERTY', 'COMMENT_KEY')),
  source_key_text   varchar(128) NOT NULL,
  created_by_user_id varchar(100),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attr_def_id, source_type_code),
  CHECK (method_code = 'COMMENT_KEY' OR source_type_code = 'MSSQL')
);

-- Which values came from the source on the last crawl: { "<ATTR_CODE>": { "value": …, "sourceKey": "owner",
-- "method": "COMMENT_KEY", "crawledAt": "…" } } — drives the "from source" badge, and lets a value that
-- disappears at the source be cleared rather than left stale.
ALTER TABLE bayanat.custom_attribute_values
  ADD COLUMN IF NOT EXISTS source_synced_json jsonb NOT NULL DEFAULT '{}'::jsonb;
