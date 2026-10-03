-- View definitions captured by the crawler for every database engine (PostgreSQL,
-- SQL Server, Oracle, MySQL), so "How this view is built" doesn't depend on a
-- PostgreSQL lineage scan. Dialect tells the parser how to read the SQL.
ALTER TABLE bayanat.data_entities
  ADD COLUMN IF NOT EXISTS view_definition_text text,
  ADD COLUMN IF NOT EXISTS view_definition_dialect varchar(20)
    CHECK (view_definition_dialect IN ('POSTGRES', 'MSSQL', 'ORACLE', 'MYSQL')),
  ADD COLUMN IF NOT EXISTS view_definition_captured_at timestamptz;
