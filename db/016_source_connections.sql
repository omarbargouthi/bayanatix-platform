-- Extend connection_registry with credentials + crawl tracking
ALTER TABLE bayanat.connection_registry
  ADD COLUMN IF NOT EXISTS username_text        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS password_text        TEXT,
  ADD COLUMN IF NOT EXISTS ssl_enabled          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS connection_status    VARCHAR(20) NOT NULL DEFAULT 'UNCHECKED',
  ADD COLUMN IF NOT EXISTS last_tested_at       TIMESTAMP,
  ADD COLUMN IF NOT EXISTS crawl_status         VARCHAR(20) NOT NULL DEFAULT 'IDLE',
  ADD COLUMN IF NOT EXISTS crawl_error_text     TEXT,
  ADD COLUMN IF NOT EXISTS crawled_schema_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crawled_table_count  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crawled_column_count INT DEFAULT 0;

-- Link catalogued data_sources back to the connection that generated them
ALTER TABLE bayanat.data_sources
  ADD COLUMN IF NOT EXISTS connection_id     INT REFERENCES bayanat.connection_registry(connection_id),
  ADD COLUMN IF NOT EXISTS business_app_name VARCHAR(100);
