-- 154: report pages and visuals as catalog object types.
-- A crawled Power BI report is cataloged down to its pages and the visuals on them
-- (REPORT_PAGE, REPORT_VISUAL), so lineage runs model table -> visual -> page.
-- Safe to run more than once.

BEGIN;

ALTER TABLE bayanat.data_entities DROP CONSTRAINT IF EXISTS data_entities_object_type_code_check;
ALTER TABLE bayanat.data_entities ADD CONSTRAINT data_entities_object_type_code_check
  CHECK (object_type_code IN (
    'TABLE', 'VIEW', 'MATERIALIZED_VIEW', 'FOREIGN_TABLE', 'LAKEHOUSE_TABLE',
    'FILE', 'API_RESOURCE', 'SEMANTIC_MODEL', 'REPORT', 'REPORT_PAGE', 'REPORT_VISUAL', 'UNKNOWN'
  ));

COMMIT;
