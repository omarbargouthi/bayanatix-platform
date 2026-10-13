-- 185: Azure Data Factory and Azure Synapse crawlers (lib/lineage/azure). Their pipelines,
-- Copy activities, mapping data flows and notebooks are lineage processes, so the process
-- types gain a set for each service. Connections use db_type_code 'ADF' / 'SYNAPSE'
-- (connection_registry has no type constraint).
-- Safe to run more than once.

BEGIN;

ALTER TABLE bayanat.lineage_processes DROP CONSTRAINT IF EXISTS lineage_processes_process_type_code_check;
ALTER TABLE bayanat.lineage_processes ADD CONSTRAINT lineage_processes_process_type_code_check
  CHECK (process_type_code IN (
    'PROCEDURE', 'FUNCTION', 'VIEW', 'MATVIEW',
    'SSIS_PACKAGE', 'SSIS_DATAFLOW',
    'PBI_DATASET', 'PBI_REPORT', 'FABRIC_DATAFLOW', 'FABRIC_PIPELINE', 'FABRIC_NOTEBOOK',
    'ADF_PIPELINE', 'ADF_COPY', 'ADF_DATAFLOW', 'ADF_NOTEBOOK',
    'SYNAPSE_PIPELINE', 'SYNAPSE_COPY', 'SYNAPSE_DATAFLOW', 'SYNAPSE_NOTEBOOK',
    'MANUAL'
  ));

COMMIT;
