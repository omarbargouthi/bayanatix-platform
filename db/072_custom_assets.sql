-- ── Custom Asset Framework — metamodel layer ────────────────────────────────
-- Lets admins define custom asset types (Role, Customer, Activity…) with their own
-- attribute schema, create instances, and link them (typed relationships) to core
-- catalog assets and to each other. See DG Files/Bayanatix - Custom Asset Framework
-- Feature Spec.md §2 for the source design; a few corrections applied here — see
-- the implementation plan for details (no DB audit trigger exists app-wide since
-- 009_fix_audit.sql, so these tables rely on explicit lib/audit.ts calls from their
-- API routes rather than a CREATE TRIGGER).

CREATE TABLE IF NOT EXISTS bayanat.custom_asset_types (
  type_id              serial4 PRIMARY KEY,
  type_code            varchar(30)  NOT NULL UNIQUE,
  type_name_text       varchar(100) NOT NULL,
  name_ar_text         varchar(100),
  description_text     text,
  icon_code            varchar(30),
  color_hex            varchar(7),
  is_enabled_indicator boolean NOT NULL DEFAULT true,
  created_by_user_id   varchar(100),
  created_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bayanat.custom_asset_type_attributes (
  attr_def_id           serial4 PRIMARY KEY,
  type_id               int4 NOT NULL REFERENCES bayanat.custom_asset_types(type_id) ON DELETE CASCADE,
  attr_code              varchar(30)  NOT NULL,
  attr_name_text         varchar(100) NOT NULL,
  name_ar_text            varchar(100),
  data_type_code           varchar(20) NOT NULL,
  enum_values_json         jsonb,
  is_required_indicator    boolean NOT NULL DEFAULT false,
  is_unique_indicator      boolean NOT NULL DEFAULT false,
  display_order_int        int2 NOT NULL DEFAULT 0,
  CONSTRAINT uq_type_attr UNIQUE (type_id, attr_code),
  CONSTRAINT chk_attr_data_type CHECK (data_type_code IN ('TEXT','LONGTEXT','NUMBER','DATE','BOOLEAN','ENUM','USER','URL'))
);

CREATE TABLE IF NOT EXISTS bayanat.custom_assets (
  custom_asset_id     serial4 PRIMARY KEY,
  type_id             int4 NOT NULL REFERENCES bayanat.custom_asset_types(type_id),
  asset_name_text     varchar(255) NOT NULL,
  name_ar_text        varchar(255),
  description_text    text,
  attributes_json      jsonb NOT NULL DEFAULT '{}',
  status_code          varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_by_user_id   varchar(100),
  created_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_custom_asset_status CHECK (status_code IN ('ACTIVE','DEPRECATED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_assets_type_name ON bayanat.custom_assets (type_id, asset_name_text);

CREATE TABLE IF NOT EXISTS bayanat.custom_relationship_types (
  rel_type_id            serial4 PRIMARY KEY,
  rel_code                varchar(30) NOT NULL UNIQUE,
  rel_name_text            varchar(100) NOT NULL,
  name_ar_text              varchar(100),
  inverse_name_text         varchar(100),
  inverse_name_ar_text      varchar(100),
  from_endpoint_json        jsonb NOT NULL,
  to_endpoint_json          jsonb NOT NULL,
  cardinality_code          varchar(10) NOT NULL DEFAULT 'M:N',
  attributes_schema_json    jsonb,
  is_enabled_indicator      boolean NOT NULL DEFAULT true,
  created_by_user_id        varchar(100),
  created_at                timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_rel_cardinality CHECK (cardinality_code IN ('M:N','1:N','N:1'))
);

CREATE TABLE IF NOT EXISTS bayanat.custom_asset_links (
  link_id              serial4 PRIMARY KEY,
  rel_type_id          int4 NOT NULL REFERENCES bayanat.custom_relationship_types(rel_type_id),
  from_asset_type_code varchar(50) NOT NULL,
  from_asset_id        int4 NOT NULL,
  to_asset_type_code   varchar(50) NOT NULL,
  to_asset_id          int4 NOT NULL,
  attributes_json      jsonb NOT NULL DEFAULT '{}',
  valid_from_date      date,
  valid_to_date        date,
  created_by_user_id   varchar(100),
  created_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_link UNIQUE (rel_type_id, from_asset_type_code, from_asset_id, to_asset_type_code, to_asset_id)
);
CREATE INDEX IF NOT EXISTS idx_cal_from ON bayanat.custom_asset_links (from_asset_type_code, from_asset_id);
CREATE INDEX IF NOT EXISTS idx_cal_to   ON bayanat.custom_asset_links (to_asset_type_code, to_asset_id);
CREATE INDEX IF NOT EXISTS idx_cal_rel  ON bayanat.custom_asset_links (rel_type_id);

-- asset_tags.asset_type_code is varchar(30) — tighter than asset_stakeholders' and
-- asset_requests' varchar(50) — widen so 'CUSTOM:<type_code>' (up to 37 chars) can't
-- overflow it the way the other two polymorphic tables already allow.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'bayanat' AND table_name = 'asset_tags' AND column_name = 'asset_type_code' AND character_maximum_length = 30
  ) THEN
    ALTER TABLE bayanat.asset_tags ALTER COLUMN asset_type_code TYPE varchar(50);
  END IF;
END
$$;

-- ── Seed: B2B Consumption template core pieces (Customer type + CONSUMES rel) ──
INSERT INTO bayanat.custom_asset_types (type_code, type_name_text, name_ar_text, description_text, icon_code, color_hex, created_by_user_id)
VALUES ('CUSTOMER', 'Customer', 'العميل', 'External customer or consumer of a data source.', 'building', '#6058A0', 'sara.alqahtani')
ON CONFLICT (type_code) DO NOTHING;

INSERT INTO bayanat.custom_asset_type_attributes (type_id, attr_code, attr_name_text, name_ar_text, data_type_code, enum_values_json, is_required_indicator, is_unique_indicator, display_order_int)
SELECT t.type_id, v.attr_code, v.attr_name_text, v.name_ar_text, v.data_type_code, v.enum_values_json::jsonb, v.is_required, v.is_unique, v.sort_order
FROM bayanat.custom_asset_types t
JOIN (VALUES
  ('CR_NUMBER', 'CR Number',  'رقم السجل التجاري', 'TEXT',    NULL,                                 true,  true,  1),
  ('SECTOR',    'Sector',     'القطاع',             'ENUM',    '["Government","Banking","Retail","Healthcare","Other"]', true,  false, 2),
  ('CONTACT',   'Contact',    'جهة الاتصال',        'TEXT',    NULL,                                 false, false, 3)
) AS v(attr_code, attr_name_text, name_ar_text, data_type_code, enum_values_json, is_required, is_unique, sort_order)
  ON t.type_code = 'CUSTOMER'
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.custom_asset_type_attributes a WHERE a.type_id = t.type_id AND a.attr_code = v.attr_code
);

INSERT INTO bayanat.custom_relationship_types
  (rel_code, rel_name_text, name_ar_text, inverse_name_text, inverse_name_ar_text, from_endpoint_json, to_endpoint_json, cardinality_code, attributes_schema_json, created_by_user_id)
VALUES (
  'CONSUMES', 'Consumes', 'يستهلك', 'Consumed by', 'يُستهلك بواسطة',
  '["CUSTOM:CUSTOMER"]'::jsonb, '["DATA_SOURCES"]'::jsonb, 'M:N',
  '[{"attr_code":"ACCESS_LEVEL","attr_name_text":"Access Level","name_ar_text":"مستوى الوصول","data_type_code":"ENUM","enum_values_json":["READ","WRITE"],"is_required_indicator":true}]'::jsonb,
  'sara.alqahtani'
)
ON CONFLICT (rel_code) DO NOTHING;

-- Demo instance: ACME Corp, linked to the PostgreSQL Production source (data_source_id 1)
INSERT INTO bayanat.custom_assets (type_id, asset_name_text, name_ar_text, attributes_json, created_by_user_id)
SELECT t.type_id, 'ACME Corp', 'شركة أكمي', '{"CR_NUMBER":"1010123456","SECTOR":"Retail","CONTACT":"ops@acme.example"}'::jsonb, 'sara.alqahtani'
FROM bayanat.custom_asset_types t
WHERE t.type_code = 'CUSTOMER'
  AND NOT EXISTS (SELECT 1 FROM bayanat.custom_assets ca WHERE ca.type_id = t.type_id AND ca.asset_name_text = 'ACME Corp');

INSERT INTO bayanat.custom_asset_links (rel_type_id, from_asset_type_code, from_asset_id, to_asset_type_code, to_asset_id, attributes_json, created_by_user_id)
SELECT rt.rel_type_id, 'CUSTOM:CUSTOMER', ca.custom_asset_id, 'DATA_SOURCES', 1, '{"ACCESS_LEVEL":"READ"}'::jsonb, 'sara.alqahtani'
FROM bayanat.custom_relationship_types rt
JOIN bayanat.custom_assets ca ON ca.asset_name_text = 'ACME Corp'
WHERE rt.rel_code = 'CONSUMES'
  AND EXISTS (SELECT 1 FROM bayanat.data_sources ds WHERE ds.data_source_id = 1)
ON CONFLICT DO NOTHING;
