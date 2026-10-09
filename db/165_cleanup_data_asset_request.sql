-- 165: "Clean up data asset" request.
-- A request to remove or purge tables or columns in a source system. Bayanis does not
-- touch the source: it carries the decision. Raised by the asset's Technical (IT)
-- Steward, reviewed by its Business Steward, approved by its Data Owner, then carried
-- out on the source system by a Database Administrator, who closes the request once
-- the work is done.
--   * request type CLEANUP_DATA_ASSET
--   * two stage-assignee kinds the engine lacked: the asset's Business Steward alone and
--     its Technical Steward alone (ASSET_STEWARD means owner + both stewards together)
--   * the workflow, mapped to the request type
-- Safe to run more than once.

BEGIN;

ALTER TABLE bayanat.asset_requests DROP CONSTRAINT IF EXISTS asset_requests_request_type_code_check;
ALTER TABLE bayanat.asset_requests ADD CONSTRAINT asset_requests_request_type_code_check
  CHECK (request_type_code IN (
    'FIX_DATA_ISSUE', 'UPDATE_DEFINITION', 'CERTIFY_ASSET', 'GRANT_ACCESS', 'REMOVE_ACCESS', 'OTHER',
    'CLASSIFY_ASSET', 'PUBLISH_OPEN_DATA', 'PUBLISH_OPEN_DATA_PI', 'COMPLIANCE_REVIEW', 'PI_CLEAR_TEXT_ACCESS',
    'OVERRIDE_GLOSSARY_GOVERNANCE', 'METADATA_UPDATE', 'CHANGE_IMPACT_REVIEW', 'LINEAGE_CHANGE', 'LINEAGE_REVIEW',
    'CLEANUP_DATA_ASSET'
  ));

ALTER TABLE bayanat.workflow_stages DROP CONSTRAINT IF EXISTS workflow_stages_assignee_type_check;
ALTER TABLE bayanat.workflow_stages ADD CONSTRAINT workflow_stages_assignee_type_check
  CHECK (assignee_type IN ('ROLE', 'TEAM', 'USER', 'REQUESTER', 'ASSET_OWNER', 'ASSET_STEWARD', 'ASSET_BIZ_STEWARD', 'ASSET_TECH_STEWARD'));

INSERT INTO bayanat.workflow_definitions (workflow_name_text, description_text, status_code)
SELECT 'Data Asset Cleanup',
       'Clean-up of tables or columns in a source system: raised by the Technical Steward, reviewed by the Business Steward, approved by the Data Owner, carried out and closed by a Database Administrator',
       'Active'
WHERE NOT EXISTS (SELECT 1 FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Data Asset Cleanup');

INSERT INTO bayanat.workflow_stages (workflow_id, stage_name_text, sla_days_count, stage_order, description_text, is_final, assignee_type, assignee_role_id)
SELECT w.workflow_id, v.stage_name, v.sla_days, v.stage_order, v.description, v.is_final, v.assignee_type,
       CASE WHEN v.assignee_type = 'ROLE' THEN (SELECT role_id FROM bayanat.roles WHERE role_name = 'Database Administrator') END
FROM bayanat.workflow_definitions w
CROSS JOIN (VALUES
  ('Business Steward Review', 3, 1, 'The asset''s Business Steward confirms the data is no longer needed by the business and that the clean-up is correctly scoped', false, 'ASSET_BIZ_STEWARD'),
  ('Data Owner Approval',     3, 2, 'The asset''s Data Owner approves the clean-up',                                                                                        false, 'ASSET_OWNER'),
  ('DBA Execution',           5, 3, 'A Database Administrator carries out the clean-up on the source system, then completes this step to close the request',               true,  'ROLE')
) AS v(stage_name, sla_days, stage_order, description, is_final, assignee_type)
WHERE w.workflow_name_text = 'Data Asset Cleanup'
  AND NOT EXISTS (SELECT 1 FROM bayanat.workflow_stages s WHERE s.workflow_id = w.workflow_id);

INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id)
SELECT 'CLEANUP_DATA_ASSET', w.workflow_id FROM bayanat.workflow_definitions w
WHERE w.workflow_name_text = 'Data Asset Cleanup'
  AND NOT EXISTS (SELECT 1 FROM bayanat.request_type_workflows WHERE request_type_code = 'CLEANUP_DATA_ASSET');

-- The Database Administrator role: reads the metadata of every source system (its
-- existing read-only privilege, when assigned globally) and carries out approved work on
-- them. It stays a read-only role in Bayanis — closing a request is a workflow step.
UPDATE bayanat.roles
SET description = 'Reads the metadata of all source systems. Carries out approved access and clean-up work on the source systems and closes those requests. Assign it globally (all assets).'
WHERE role_name = 'Database Administrator';

COMMIT;
