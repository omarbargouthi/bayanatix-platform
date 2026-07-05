-- Migration 046: governance hierarchy, business term ownership, open-data soft delete

-- ── 1. Soft delete for open_datasets ──────────────────────────────────────────
ALTER TABLE bayanat.open_datasets
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255) REFERENCES bayanat.users(user_id);

-- ── 2. Business glossary ownership ────────────────────────────────────────────
-- One owner per domain or term (nullable = inherits from parent domain)
ALTER TABLE bayanat.business_glossaries
  ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(255) REFERENCES bayanat.users(user_id) ON DELETE SET NULL;

-- Multiple stewards per domain or term (nullable = inherits from parent domain's stewards)
CREATE TABLE IF NOT EXISTS bayanat.glossary_stewards (
  steward_id  SERIAL PRIMARY KEY,
  glossary_id INT          NOT NULL REFERENCES bayanat.business_glossaries(glossary_id) ON DELETE CASCADE,
  user_id     VARCHAR(255) NOT NULL REFERENCES bayanat.users(user_id),
  assigned_by VARCHAR(255)          REFERENCES bayanat.users(user_id),
  assigned_at TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE (glossary_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_glossary_stewards_glossary ON bayanat.glossary_stewards(glossary_id);
CREATE INDEX IF NOT EXISTS idx_glossary_stewards_user     ON bayanat.glossary_stewards(user_id);

-- ── 3. Governance hierarchy resolver (column → table → schema → source) ───────
-- asset_stakeholders already stores rows for any asset_type_code.
-- Accepted values for hierarchy: DATA_ATTRIBUTES, DATA_ENTITIES, DATA_SCHEMAS, DATA_SOURCES.
-- Column-level overrides table-level which overrides schema-level which overrides source-level.

CREATE OR REPLACE FUNCTION bayanat.fn_resolve_effective_stakeholder(
  p_attribute_id INT,
  p_role_code    VARCHAR(20)
) RETURNS TABLE(
  user_id       VARCHAR(255),
  resolved_from VARCHAR(20)
) LANGUAGE plpgsql AS $$
DECLARE
  v_entity_id INT;
  v_schema_id INT;
  v_source_id INT;
BEGIN
  -- 1. Column level
  IF EXISTS (
    SELECT 1 FROM bayanat.asset_stakeholders
    WHERE asset_type_code = 'DATA_ATTRIBUTES' AND asset_id = p_attribute_id AND role_code = p_role_code
  ) THEN
    RETURN QUERY
      SELECT s.user_id::VARCHAR(255), 'COLUMN'::VARCHAR(20)
      FROM bayanat.asset_stakeholders s
      WHERE s.asset_type_code = 'DATA_ATTRIBUTES' AND s.asset_id = p_attribute_id AND s.role_code = p_role_code;
    RETURN;
  END IF;

  -- 2. Table level
  SELECT a.entity_id INTO v_entity_id FROM bayanat.data_attributes a WHERE a.attribute_id = p_attribute_id;
  IF v_entity_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM bayanat.asset_stakeholders
    WHERE asset_type_code = 'DATA_ENTITIES' AND asset_id = v_entity_id AND role_code = p_role_code
  ) THEN
    RETURN QUERY
      SELECT s.user_id::VARCHAR(255), 'TABLE'::VARCHAR(20)
      FROM bayanat.asset_stakeholders s
      WHERE s.asset_type_code = 'DATA_ENTITIES' AND s.asset_id = v_entity_id AND s.role_code = p_role_code;
    RETURN;
  END IF;

  -- 3. Schema level
  SELECT e.schema_id INTO v_schema_id FROM bayanat.data_entities e WHERE e.entity_id = v_entity_id;
  IF v_schema_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM bayanat.asset_stakeholders
    WHERE asset_type_code = 'DATA_SCHEMAS' AND asset_id = v_schema_id AND role_code = p_role_code
  ) THEN
    RETURN QUERY
      SELECT s.user_id::VARCHAR(255), 'SCHEMA'::VARCHAR(20)
      FROM bayanat.asset_stakeholders s
      WHERE s.asset_type_code = 'DATA_SCHEMAS' AND s.asset_id = v_schema_id AND s.role_code = p_role_code;
    RETURN;
  END IF;

  -- 4. Source level
  SELECT sc.data_source_id INTO v_source_id FROM bayanat.data_schemas sc WHERE sc.schema_id = v_schema_id;
  IF v_source_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT s.user_id::VARCHAR(255), 'SOURCE'::VARCHAR(20)
    FROM bayanat.asset_stakeholders s
    WHERE s.asset_type_code = 'DATA_SOURCES' AND s.asset_id = v_source_id AND s.role_code = p_role_code;
END;
$$;

-- Convenience: resolve for an entity (table → schema → source)
CREATE OR REPLACE FUNCTION bayanat.fn_resolve_entity_stakeholder(
  p_entity_id INT,
  p_role_code VARCHAR(20)
) RETURNS TABLE(
  user_id       VARCHAR(255),
  resolved_from VARCHAR(20)
) LANGUAGE plpgsql AS $$
DECLARE
  v_schema_id INT;
  v_source_id INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM bayanat.asset_stakeholders
    WHERE asset_type_code = 'DATA_ENTITIES' AND asset_id = p_entity_id AND role_code = p_role_code
  ) THEN
    RETURN QUERY
      SELECT s.user_id::VARCHAR(255), 'TABLE'::VARCHAR(20)
      FROM bayanat.asset_stakeholders s
      WHERE s.asset_type_code = 'DATA_ENTITIES' AND s.asset_id = p_entity_id AND s.role_code = p_role_code;
    RETURN;
  END IF;

  SELECT e.schema_id INTO v_schema_id FROM bayanat.data_entities e WHERE e.entity_id = p_entity_id;
  IF v_schema_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM bayanat.asset_stakeholders
    WHERE asset_type_code = 'DATA_SCHEMAS' AND asset_id = v_schema_id AND role_code = p_role_code
  ) THEN
    RETURN QUERY
      SELECT s.user_id::VARCHAR(255), 'SCHEMA'::VARCHAR(20)
      FROM bayanat.asset_stakeholders s
      WHERE s.asset_type_code = 'DATA_SCHEMAS' AND s.asset_id = v_schema_id AND s.role_code = p_role_code;
    RETURN;
  END IF;

  SELECT sc.data_source_id INTO v_source_id FROM bayanat.data_schemas sc WHERE sc.schema_id = v_schema_id;
  IF v_source_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT s.user_id::VARCHAR(255), 'SOURCE'::VARCHAR(20)
    FROM bayanat.asset_stakeholders s
    WHERE s.asset_type_code = 'DATA_SOURCES' AND s.asset_id = v_source_id AND s.role_code = p_role_code;
END;
$$;

-- Index to make hierarchy lookups fast
CREATE INDEX IF NOT EXISTS idx_asset_stk_type_id_role
  ON bayanat.asset_stakeholders(asset_type_code, asset_id, role_code);
