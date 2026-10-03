-- Object type = what the asset actually is in its source system (table, view,
-- materialized view, file, semantic model table, report …), as reported by that
-- system's catalog. Replaces layer_code, which mixed real types (VIEW, REPORT)
-- with guesses from the name (stg_ → STAGING, raw_ → RAW) and roles (SOURCE).

ALTER TABLE bayanat.data_entities ADD COLUMN IF NOT EXISTS object_type_code varchar(30);
ALTER TABLE bayanat.data_entities DROP CONSTRAINT IF EXISTS data_entities_object_type_code_check;
ALTER TABLE bayanat.data_entities ADD CONSTRAINT data_entities_object_type_code_check
  CHECK (object_type_code IN ('TABLE', 'VIEW', 'MATERIALIZED_VIEW', 'FOREIGN_TABLE', 'LAKEHOUSE_TABLE',
                              'FILE', 'API_RESOURCE', 'SEMANTIC_MODEL', 'REPORT', 'UNKNOWN'));

-- Backfill from what is actually known about each entity.
UPDATE bayanat.data_entities e SET object_type_code = x.t
FROM (
  SELECT e2.entity_id,
    CASE
      -- scanned materialized views (lineage scanner records the process kind from pg_class)
      WHEN EXISTS (SELECT 1 FROM bayanat.lineage_processes p
                   WHERE p.process_type_code = 'MATVIEW' AND p.connection_id = d.connection_id
                     AND p.schema_name = s.schema_name_text AND p.process_name = e2.entity_name_text) THEN 'MATERIALIZED_VIEW'
      WHEN e2.is_view_indicator THEN 'VIEW'
      WHEN e2.layer_code = 'SEMANTIC_MODEL' THEN 'SEMANTIC_MODEL'
      WHEN e2.layer_code = 'REPORT' THEN 'REPORT'
      WHEN e2.layer_code = 'LAKEHOUSE' THEN 'LAKEHOUSE_TABLE'
      WHEN d.source_type_code IN ('CSV', 'EXCEL', 'JSON') THEN 'FILE'
      WHEN d.source_type_code IN ('REST_API', 'SOAP_API', 'API') THEN 'API_RESOURCE'
      -- placeholders created from unresolved references (stitching) or manual external
      -- endpoints: never crawled, so the real type isn't known
      WHEN e2.description_text LIKE 'Auto-created%' OR d.source_type_code = 'EXTERNAL' THEN 'UNKNOWN'
      -- crawled from a database catalog (is_view_indicator false = base table)
      ELSE 'TABLE'
    END AS t
  FROM bayanat.data_entities e2
  JOIN bayanat.data_schemas s ON s.schema_id = e2.schema_id
  JOIN bayanat.data_sources d ON d.data_source_id = s.data_source_id
) x
WHERE e.entity_id = x.entity_id AND e.object_type_code IS NULL;

UPDATE bayanat.data_entities SET object_type_code = 'UNKNOWN' WHERE object_type_code IS NULL;
ALTER TABLE bayanat.data_entities ALTER COLUMN object_type_code SET DEFAULT 'UNKNOWN';
ALTER TABLE bayanat.data_entities ALTER COLUMN object_type_code SET NOT NULL;

ALTER TABLE bayanat.data_entities DROP CONSTRAINT IF EXISTS data_entities_layer_code_check;
ALTER TABLE bayanat.data_entities DROP COLUMN IF EXISTS layer_code;
