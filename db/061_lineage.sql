-- Migration 061: Data Lineage — schema foundation (Phase 1)
-- =====================================================================
-- Extends bayanat.data_lineage for scanner provenance/confidence, adds
-- process + scan-run tracking tables, seeds transformation types, adds
-- entity layer classification, and fixes/extends the impact-traversal
-- functions with a cycle guard + depth cap.

-- ── 1. Extend data_lineage ──────────────────────────────────────────────────
ALTER TABLE bayanat.data_lineage
  ADD COLUMN IF NOT EXISTS provenance_code varchar(20) DEFAULT 'MANUAL'
    CHECK (provenance_code IN ('SCANNED', 'MANUAL')),
  ADD COLUMN IF NOT EXISTS confidence_code varchar(20)
    CHECK (confidence_code IN ('HIGH', 'MEDIUM', 'LOW')),
  ADD COLUMN IF NOT EXISTS is_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS connection_id int4;

CREATE INDEX IF NOT EXISTS ix_lineage_source ON bayanat.data_lineage(source_asset_id, lineage_scope_code);
CREATE INDEX IF NOT EXISTS ix_lineage_target ON bayanat.data_lineage(target_asset_id, lineage_scope_code);

-- Manual edges are provenance MANUAL by definition; block exact duplicate edges.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_lineage_edge
  ON bayanat.data_lineage(lineage_scope_code, source_asset_id, target_asset_id, COALESCE(process_id, -1));

-- ── 2. Process + scan-run tracking ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.lineage_processes (
  process_id serial4 PRIMARY KEY,
  connection_id int4,
  process_type_code varchar(20) NOT NULL
    CHECK (process_type_code IN ('PROCEDURE', 'FUNCTION', 'VIEW', 'MATVIEW')),
  schema_name varchar(100),
  process_name varchar(200) NOT NULL,
  definition_text text,
  definition_hash varchar(64),
  last_scanned_timestamp timestamp,
  UNIQUE (connection_id, schema_name, process_name, process_type_code)
);

CREATE TABLE IF NOT EXISTS bayanat.lineage_scan_runs (
  scan_run_id serial4 PRIMARY KEY,
  connection_id int4 NOT NULL,
  started_at timestamp DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamp,
  status_code varchar(20) DEFAULT 'RUNNING'
    CHECK (status_code IN ('RUNNING', 'COMPLETED', 'FAILED')),
  processes_scanned_count int4 DEFAULT 0,
  edges_created_count int4 DEFAULT 0,
  edges_removed_count int4 DEFAULT 0,
  warnings jsonb DEFAULT '[]'::jsonb,
  triggered_by_user_id varchar(100)
);

CREATE INDEX IF NOT EXISTS idx_lineage_scan_runs_conn ON bayanat.lineage_scan_runs(connection_id, started_at DESC);

-- FK data_lineage.process_id -> lineage_processes.process_id (no conflicting data at time of writing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'data_lineage_process_id_fkey'
  ) THEN
    ALTER TABLE bayanat.data_lineage
      ADD CONSTRAINT data_lineage_process_id_fkey
      FOREIGN KEY (process_id) REFERENCES bayanat.lineage_processes(process_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3. Seed transformation types ────────────────────────────────────────────
INSERT INTO bayanat.lineage_transformation_types (transformation_type_code, transformation_type_name_text, description_text)
VALUES
  ('DIRECT',      'Direct Copy',       'Straight column reference with no transformation.'),
  ('EXPRESSION',  'Expression',        'Calculation, function call, or CASE expression.'),
  ('AGGREGATION', 'Aggregation',       'Aggregate function (SUM, COUNT, AVG, etc.) or GROUP BY.'),
  ('JOIN',        'Join',              'Value sourced through a JOIN branch.'),
  ('FILTER',      'Filter',            'Row-level filter (WHERE / HAVING) affecting the result.'),
  ('CAST',        'Type Cast',         'Explicit or implicit data type conversion.'),
  ('LOOKUP',      'Lookup',            'Value resolved via a lookup/reference join.'),
  ('MANUAL',      'Manual',            'Manually curated by a steward; no scanned transformation.'),
  ('UNKNOWN',     'Unknown',           'Unresolvable — SELECT *, dynamic SQL, or ambiguous source.')
ON CONFLICT (transformation_type_code) DO NOTHING;

-- ── 4. Entity layer classification ──────────────────────────────────────────
ALTER TABLE bayanat.data_entities
  ADD COLUMN IF NOT EXISTS layer_code varchar(20)
    CHECK (layer_code IN ('SOURCE', 'RAW', 'STAGING', 'TABLE', 'VIEW', 'DASHBOARD'));

-- ── 5. Impact traversal: cycle-safe + depth-capped ──────────────────────────
DROP FUNCTION IF EXISTS bayanat.fn_get_downstream_impact(integer, character varying);
DROP FUNCTION IF EXISTS bayanat.fn_get_downstream_impact(integer, character varying, integer);

CREATE OR REPLACE FUNCTION bayanat.fn_get_downstream_impact(
  p_asset_id integer,
  p_scope_code character varying,
  p_max_depth integer DEFAULT 10
)
RETURNS TABLE(impact_level integer, downstream_asset_id integer, lineage_id integer, transformation_logic text)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH RECURSIVE impact_path AS (
    -- Anchor: immediate downstream targets of our asset
    SELECT
      1 AS depth,
      dl.target_asset_id,
      dl.lineage_id,
      dl.transformation_logic_text,
      ARRAY[p_asset_id, dl.target_asset_id] AS visited
    FROM bayanat.data_lineage dl
    WHERE dl.source_asset_id = p_asset_id
      AND dl.lineage_scope_code = p_scope_code

    UNION ALL

    -- Recursive: targets of those targets, guarded against revisiting a node
    -- already on this path (cycle guard) and capped at p_max_depth.
    SELECT
      ip.depth + 1,
      dl.target_asset_id,
      dl.lineage_id,
      dl.transformation_logic_text,
      ip.visited || dl.target_asset_id
    FROM bayanat.data_lineage dl
    JOIN impact_path ip ON dl.source_asset_id = ip.target_asset_id
    WHERE dl.lineage_scope_code = p_scope_code
      AND ip.depth < p_max_depth
      AND NOT (dl.target_asset_id = ANY(ip.visited))
  )
  SELECT depth, target_asset_id, impact_path.lineage_id, transformation_logic_text FROM impact_path;
END;
$function$;

DROP FUNCTION IF EXISTS bayanat.fn_get_upstream_impact(integer, character varying, integer);

CREATE OR REPLACE FUNCTION bayanat.fn_get_upstream_impact(
  p_asset_id integer,
  p_scope_code character varying,
  p_max_depth integer DEFAULT 10
)
RETURNS TABLE(impact_level integer, upstream_asset_id integer, lineage_id integer, transformation_logic text)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH RECURSIVE impact_path AS (
    -- Anchor: immediate upstream sources of our asset
    SELECT
      1 AS depth,
      dl.source_asset_id,
      dl.lineage_id,
      dl.transformation_logic_text,
      ARRAY[p_asset_id, dl.source_asset_id] AS visited
    FROM bayanat.data_lineage dl
    WHERE dl.target_asset_id = p_asset_id
      AND dl.lineage_scope_code = p_scope_code

    UNION ALL

    -- Recursive: sources of those sources, cycle-guarded and depth-capped.
    SELECT
      ip.depth + 1,
      dl.source_asset_id,
      dl.lineage_id,
      dl.transformation_logic_text,
      ip.visited || dl.source_asset_id
    FROM bayanat.data_lineage dl
    JOIN impact_path ip ON dl.target_asset_id = ip.source_asset_id
    WHERE dl.lineage_scope_code = p_scope_code
      AND ip.depth < p_max_depth
      AND NOT (dl.source_asset_id = ANY(ip.visited))
  )
  SELECT depth, source_asset_id, impact_path.lineage_id, transformation_logic_text FROM impact_path;
END;
$function$;
