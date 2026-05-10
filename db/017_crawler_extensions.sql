-- ── Crawl configuration per connection ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.crawl_config (
  config_id              SERIAL PRIMARY KEY,
  connection_id          INT  NOT NULL REFERENCES bayanat.connection_registry(connection_id) ON DELETE CASCADE,
  schema_include_list    TEXT[],
  schema_exclude_list    TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  table_exclude_patterns TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  profiling_enabled      BOOLEAN NOT NULL DEFAULT false,
  profiling_mode         VARCHAR(20)  NOT NULL DEFAULT 'TOP_N',
  profiling_limit        INT          NOT NULL DEFAULT 1000,
  updated_at             TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE(connection_id)
);

-- ── Crawl job tracking ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.crawl_jobs (
  job_id          SERIAL PRIMARY KEY,
  connection_id   INT REFERENCES bayanat.connection_registry(connection_id) ON DELETE SET NULL,
  connection_name VARCHAR(200) NOT NULL,
  started_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMP,
  status          VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
  schema_count    INT NOT NULL DEFAULT 0,
  table_count     INT NOT NULL DEFAULT 0,
  column_count    INT NOT NULL DEFAULT 0,
  error_text      TEXT
);

CREATE TABLE IF NOT EXISTS bayanat.crawl_job_logs (
  log_id    SERIAL PRIMARY KEY,
  job_id    INT  NOT NULL REFERENCES bayanat.crawl_jobs(job_id) ON DELETE CASCADE,
  logged_at TIMESTAMP NOT NULL DEFAULT NOW(),
  level     VARCHAR(10) NOT NULL DEFAULT 'INFO',
  message   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crawl_job_logs_job_id ON bayanat.crawl_job_logs(job_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_connection  ON bayanat.crawl_jobs(connection_id, started_at DESC);

-- ── Entity-level profiling results ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.entity_profile (
  profile_id      SERIAL PRIMARY KEY,
  entity_id       INT NOT NULL REFERENCES bayanat.data_entities(entity_id) ON DELETE CASCADE,
  job_id          INT REFERENCES bayanat.crawl_jobs(job_id) ON DELETE SET NULL,
  profiled_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  row_count       BIGINT,
  sample_size     BIGINT,
  profiling_mode  VARCHAR(20),
  profiling_limit INT
);

CREATE TABLE IF NOT EXISTS bayanat.attribute_profile (
  attr_profile_id SERIAL PRIMARY KEY,
  profile_id      INT  NOT NULL REFERENCES bayanat.entity_profile(profile_id)  ON DELETE CASCADE,
  attribute_id    INT  NOT NULL REFERENCES bayanat.data_attributes(attribute_id) ON DELETE CASCADE,
  null_count      BIGINT,
  null_pct        NUMERIC(6,2),
  distinct_count  BIGINT,
  min_value       TEXT,
  max_value       TEXT,
  top_values      JSONB,
  UNIQUE(profile_id, attribute_id)
);

-- ── Application lookups ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.app_lookups (
  lookup_id    SERIAL PRIMARY KEY,
  lookup_group VARCHAR(100) NOT NULL,
  lookup_code  VARCHAR(100) NOT NULL,
  lookup_label VARCHAR(200) NOT NULL,
  description  TEXT,
  sort_order   INT     NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(lookup_group, lookup_code)
);

INSERT INTO bayanat.app_lookups (lookup_group, lookup_code, lookup_label, description, sort_order, is_system) VALUES
-- Table types
('TABLE_TYPE', 'MASTER',        'Master Data',           'Core reference entities: customers, products, employees', 1, true),
('TABLE_TYPE', 'TRANSACTIONAL', 'Transactional',         'Event and transaction records', 2, true),
('TABLE_TYPE', 'REFERENCE',     'Reference / Lookup',    'Small code-value lookup tables', 3, true),
('TABLE_TYPE', 'STAGING',       'Staging',               'Temporary ETL and staging tables', 4, true),
('TABLE_TYPE', 'REPORTING',     'Reporting / Aggregate', 'Pre-aggregated or denormalised reporting tables', 5, true),
-- Asset types
('ASSET_TYPE', 'BUSINESS', 'Business Asset', 'Governed business entity exposed to business users', 1, true),
('ASSET_TYPE', 'TECHNICAL', 'Technical Asset', 'Raw technical table or view', 2, true),
-- Data classification
('CLASSIFICATION', 'PUBLIC',       'Public',       'No access restrictions', 1, true),
('CLASSIFICATION', 'INTERNAL',     'Internal',     'Internal use only — not for external sharing', 2, true),
('CLASSIFICATION', 'CONFIDENTIAL', 'Confidential', 'Restricted — requires approval to access', 3, true),
('CLASSIFICATION', 'SECRET',       'Secret',       'Highly restricted — limited personnel only', 4, true),
('CLASSIFICATION', 'TOP_SECRET',   'Top Secret',   'Maximum restriction — executive approval required', 5, true),
-- Data domains
('DATA_DOMAIN', 'FINANCE',     'Finance',           'Financial and accounting data', 1, true),
('DATA_DOMAIN', 'HR',          'Human Resources',   'HR and workforce data', 2, true),
('DATA_DOMAIN', 'CUSTOMER',    'Customer',          'Customer-facing and CRM data', 3, true),
('DATA_DOMAIN', 'OPERATIONS',  'Operations',        'Operational and supply chain data', 4, true),
('DATA_DOMAIN', 'PRODUCT',     'Product',           'Product catalogue and inventory data', 5, true),
('DATA_DOMAIN', 'COMPLIANCE',  'Compliance / Risk', 'Regulatory and risk management data', 6, true),
-- Data quality dimensions
('DQ_DIMENSION', 'COMPLETENESS', 'Completeness', 'Measures presence of required values', 1, true),
('DQ_DIMENSION', 'ACCURACY',     'Accuracy',     'Measures correctness against a source of truth', 2, true),
('DQ_DIMENSION', 'CONSISTENCY',  'Consistency',  'Measures agreement across systems', 3, true),
('DQ_DIMENSION', 'TIMELINESS',   'Timeliness',   'Measures data freshness and latency', 4, true),
('DQ_DIMENSION', 'UNIQUENESS',   'Uniqueness',   'Measures duplicate records', 5, true),
('DQ_DIMENSION', 'VALIDITY',     'Validity',     'Measures conformance to format or business rules', 6, true)
ON CONFLICT (lookup_group, lookup_code) DO NOTHING;
