-- 083: Data Lineage v2 — cross-engine/BI lineage (SSIS + Power BI + Fabric).
-- Widens the two lineage CHECK constraints that were fixed to v1's Postgres-only
-- vocabulary, adds the stitching-support tables (asset_external_ids,
-- lineage_connection_aliases, lineage_stitch_queue), and connection_registry.auth_config
-- for service-principal-style credentials (client secret still goes through
-- credential_secret_path, never stored here).

-- Fold any existing DASHBOARD-tagged entities to REPORT before the CHECK changes
-- (DASHBOARD was reserved-but-unused in v1 per lib/lineage-scanner.ts's own comment).
UPDATE bayanat.data_entities SET layer_code = 'REPORT' WHERE layer_code = 'DASHBOARD';

ALTER TABLE bayanat.data_entities DROP CONSTRAINT IF EXISTS data_entities_layer_code_check;
ALTER TABLE bayanat.data_entities ADD CONSTRAINT data_entities_layer_code_check
  CHECK (layer_code IN ('SOURCE', 'RAW', 'STAGING', 'TABLE', 'VIEW', 'LAKEHOUSE', 'SEMANTIC_MODEL', 'REPORT'));

ALTER TABLE bayanat.lineage_processes DROP CONSTRAINT IF EXISTS lineage_processes_process_type_code_check;
ALTER TABLE bayanat.lineage_processes ADD CONSTRAINT lineage_processes_process_type_code_check
  CHECK (process_type_code IN (
    'PROCEDURE', 'FUNCTION', 'VIEW', 'MATVIEW',
    'SSIS_PACKAGE', 'SSIS_DATAFLOW',
    'PBI_DATASET', 'PBI_REPORT',
    'FABRIC_DATAFLOW', 'FABRIC_PIPELINE', 'FABRIC_NOTEBOOK'
  ));

ALTER TABLE bayanat.lineage_processes
  ADD COLUMN IF NOT EXISTS parent_process_id int4 REFERENCES bayanat.lineage_processes(process_id),
  ADD COLUMN IF NOT EXISTS external_ref_text varchar(400);

ALTER TABLE bayanat.connection_registry
  ADD COLUMN IF NOT EXISTS auth_config jsonb;

CREATE TABLE IF NOT EXISTS bayanat.asset_external_ids (
  external_id_pk serial4 PRIMARY KEY,
  asset_type_code varchar(50) NOT NULL,          -- DATA_SOURCES | DATA_SCHEMAS | DATA_ENTITIES | DATA_ATTRIBUTES
  asset_id int4 NOT NULL,
  system_code varchar(20) NOT NULL,              -- POWERBI | FABRIC | SSISDB
  external_id_text varchar(200) NOT NULL,
  UNIQUE (system_code, external_id_text),
  UNIQUE (asset_type_code, asset_id, system_code)
);

CREATE TABLE IF NOT EXISTS bayanat.lineage_connection_aliases (
  alias_id serial4 PRIMARY KEY,
  connection_id int4 NOT NULL REFERENCES bayanat.connection_registry(connection_id),
  engine_code varchar(20) NOT NULL,
  alias_fingerprint_text varchar(400) NOT NULL,  -- normalized "engine|host|database" fingerprint
  created_by_user_id varchar(100),
  created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (engine_code, alias_fingerprint_text)
);

CREATE TABLE IF NOT EXISTS bayanat.lineage_stitch_queue (
  stitch_id serial4 PRIMARY KEY,
  scan_run_id int4 REFERENCES bayanat.lineage_scan_runs(scan_run_id),
  external_ref jsonb NOT NULL,                   -- the normalized tuple
  placeholder_entity_id int4 REFERENCES bayanat.data_entities(entity_id),
  candidate_connections jsonb DEFAULT '[]'::jsonb,
  status_code varchar(20) DEFAULT 'OPEN' CHECK (status_code IN ('OPEN', 'RESOLVED', 'DISMISSED')),
  resolved_by_user_id varchar(100),
  resolved_at_timestamp timestamp,
  created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO bayanat.lineage_transformation_types (transformation_type_code, transformation_type_name_text, description_text) VALUES
  ('MEASURE', 'DAX measure', 'Power BI DAX measure calculation')
ON CONFLICT (transformation_type_code) DO NOTHING;
