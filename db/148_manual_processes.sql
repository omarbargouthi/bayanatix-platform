-- Named manual processes: a steward groups manual lineage links under a named
-- process ("Nightly ETL to the data warehouse", "Monthly finance upload") the way
-- scanned links already sit under their stored procedure / SSIS package / dataflow.
ALTER TABLE bayanat.lineage_processes DROP CONSTRAINT IF EXISTS lineage_processes_process_type_code_check;
ALTER TABLE bayanat.lineage_processes ADD CONSTRAINT lineage_processes_process_type_code_check
  CHECK (process_type_code IN ('PROCEDURE', 'FUNCTION', 'VIEW', 'MATVIEW', 'SSIS_PACKAGE', 'SSIS_DATAFLOW', 'PBI_DATASET',
                               'PBI_REPORT', 'FABRIC_DATAFLOW', 'FABRIC_PIPELINE', 'FABRIC_NOTEBOOK', 'MANUAL'));

ALTER TABLE bayanat.lineage_processes
  ADD COLUMN IF NOT EXISTS description_text text,
  ADD COLUMN IF NOT EXISTS created_by_user_id varchar(100),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS ux_lineage_processes_manual_name
  ON bayanat.lineage_processes (lower(process_name)) WHERE process_type_code = 'MANUAL';

-- The process a proposed change puts the link in (set_process = the change sets it;
-- an edit that doesn't mention the process leaves it as it is).
ALTER TABLE bayanat.lineage_changes
  ADD COLUMN IF NOT EXISTS process_id integer REFERENCES bayanat.lineage_processes(process_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS set_process boolean NOT NULL DEFAULT false;
