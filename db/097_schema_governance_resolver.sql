-- Migration 097: schema-level effective-governance resolver
-- Completes the inheritance chain from db/046_governance_ownership.sql
-- (column -> table -> schema -> source) with the missing schema -> source leg,
-- so a schema page can show "inherited from Source" the same way tables/columns do.

CREATE OR REPLACE FUNCTION bayanat.fn_resolve_schema_stakeholder(
  p_schema_id INT,
  p_role_code VARCHAR(20)
) RETURNS TABLE(
  user_id       VARCHAR(255),
  resolved_from VARCHAR(20)
) LANGUAGE plpgsql AS $$
DECLARE
  v_source_id INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM bayanat.asset_stakeholders
    WHERE asset_type_code = 'DATA_SCHEMAS' AND asset_id = p_schema_id AND role_code = p_role_code
  ) THEN
    RETURN QUERY
      SELECT s.user_id::VARCHAR(255), 'SCHEMA'::VARCHAR(20)
      FROM bayanat.asset_stakeholders s
      WHERE s.asset_type_code = 'DATA_SCHEMAS' AND s.asset_id = p_schema_id AND s.role_code = p_role_code;
    RETURN;
  END IF;

  SELECT sc.data_source_id INTO v_source_id FROM bayanat.data_schemas sc WHERE sc.schema_id = p_schema_id;
  IF v_source_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT s.user_id::VARCHAR(255), 'SOURCE'::VARCHAR(20)
    FROM bayanat.asset_stakeholders s
    WHERE s.asset_type_code = 'DATA_SOURCES' AND s.asset_id = v_source_id AND s.role_code = p_role_code;
END;
$$;
