-- ── Usage snapshots per entity ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.data_entity_usage (
  entity_id        INTEGER PRIMARY KEY REFERENCES bayanat.data_entities(entity_id) ON DELETE CASCADE,
  queries_30d      INTEGER NOT NULL DEFAULT 0,
  queries_prev_30d INTEGER NOT NULL DEFAULT 0,
  unique_users     INTEGER NOT NULL DEFAULT 0,
  unique_users_prev INTEGER NOT NULL DEFAULT 0,
  avg_query_ms     INTEGER NOT NULL DEFAULT 0,
  avg_query_ms_prev INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Seed realistic usage data for every existing table/view
INSERT INTO bayanat.data_entity_usage
  (entity_id, queries_30d, queries_prev_30d, unique_users, unique_users_prev,
   avg_query_ms, avg_query_ms_prev, last_accessed_at)
SELECT
  entity_id,
  (floor(random() * 2000 + 50))::int,
  (floor(random() * 2000 + 50))::int,
  (floor(random() * 40  + 3))::int,
  (floor(random() * 40  + 3))::int,
  (floor(random() * 4500 + 200))::int,
  (floor(random() * 4500 + 200))::int,
  NOW() - (random() * interval '48 hours')
FROM bayanat.data_entities
ON CONFLICT (entity_id) DO NOTHING;

-- ── Incidents ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.data_incidents (
  incident_id     SERIAL PRIMARY KEY,
  asset_type_code VARCHAR(30)  NOT NULL DEFAULT 'DATA_ENTITIES',
  asset_id        INTEGER      NOT NULL,
  title           VARCHAR(200) NOT NULL,
  severity_code   VARCHAR(10)  NOT NULL CHECK (severity_code IN ('HIGH','MEDIUM','LOW')),
  status_code     VARCHAR(20)  NOT NULL DEFAULT 'OPEN'
                               CHECK (status_code IN ('OPEN','IN_PROGRESS','RESOLVED')),
  description     TEXT,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_asset
  ON bayanat.data_incidents (asset_type_code, asset_id, status_code);

-- Seed open incidents for ~45% of tables (random realistic titles)
INSERT INTO bayanat.data_incidents (asset_type_code, asset_id, title, severity_code, status_code)
SELECT
  'DATA_ENTITIES',
  entity_id,
  CASE (floor(random() * 5))::int
    WHEN 0 THEN 'Missing values detected in key columns'
    WHEN 1 THEN 'Row count anomaly — unexpected drop'
    WHEN 2 THEN 'Schema drift from expected definition'
    WHEN 3 THEN 'Freshness SLA breach (>24 h stale)'
    ELSE        'Duplicate records found'
  END,
  (ARRAY['HIGH','MEDIUM','LOW'])[floor(random() * 3 + 1)::int],
  (ARRAY['OPEN','OPEN','OPEN','IN_PROGRESS','RESOLVED'])[floor(random() * 5 + 1)::int]
FROM bayanat.data_entities
WHERE random() < 0.45;

-- ── Tags ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.tags (
  tag_id        SERIAL PRIMARY KEY,
  tag_name      VARCHAR(100) NOT NULL,
  parent_tag_id INTEGER REFERENCES bayanat.tags(tag_id) ON DELETE CASCADE,
  color_hex     VARCHAR(7)   NOT NULL DEFAULT '#6058A0',
  description   TEXT,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (tag_name, parent_tag_id)
);

CREATE TABLE IF NOT EXISTS bayanat.asset_tags (
  asset_tag_id    SERIAL PRIMARY KEY,
  tag_id          INTEGER NOT NULL REFERENCES bayanat.tags(tag_id) ON DELETE CASCADE,
  asset_type_code VARCHAR(30) NOT NULL,
  asset_id        INTEGER     NOT NULL,
  assigned_by     VARCHAR(50) REFERENCES bayanat.users(user_id),
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tag_id, asset_type_code, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_tags_asset
  ON bayanat.asset_tags (asset_type_code, asset_id);

-- Seed default root tags
INSERT INTO bayanat.tags (tag_name, color_hex, description) VALUES
  ('Finance',     '#6058A0', 'Finance domain assets'),
  ('Operations',  '#3B82F6', 'Operational and transactional data'),
  ('Customer',    '#10B981', 'Customer-facing data assets'),
  ('HR',          '#F59E0B', 'Human resources data'),
  ('Compliance',  '#EF4444', 'Regulatory and compliance assets'),
  ('Product',     '#8B5CF6', 'Product catalogue and inventory')
ON CONFLICT DO NOTHING;

-- Seed sub-tags under Finance
INSERT INTO bayanat.tags (tag_name, parent_tag_id, color_hex)
SELECT 'Revenue',    tag_id, '#6058A0' FROM bayanat.tags WHERE tag_name='Finance'    AND parent_tag_id IS NULL ON CONFLICT DO NOTHING;
INSERT INTO bayanat.tags (tag_name, parent_tag_id, color_hex)
SELECT 'Payables',   tag_id, '#7C6BB0' FROM bayanat.tags WHERE tag_name='Finance'    AND parent_tag_id IS NULL ON CONFLICT DO NOTHING;

-- Seed sub-tags under Customer
INSERT INTO bayanat.tags (tag_name, parent_tag_id, color_hex)
SELECT 'Orders',     tag_id, '#059669' FROM bayanat.tags WHERE tag_name='Customer'   AND parent_tag_id IS NULL ON CONFLICT DO NOTHING;
INSERT INTO bayanat.tags (tag_name, parent_tag_id, color_hex)
SELECT 'Profiles',   tag_id, '#10B981' FROM bayanat.tags WHERE tag_name='Customer'   AND parent_tag_id IS NULL ON CONFLICT DO NOTHING;

-- Seed sub-tags under HR
INSERT INTO bayanat.tags (tag_name, parent_tag_id, color_hex)
SELECT 'Payroll',    tag_id, '#D97706' FROM bayanat.tags WHERE tag_name='HR'         AND parent_tag_id IS NULL ON CONFLICT DO NOTHING;
