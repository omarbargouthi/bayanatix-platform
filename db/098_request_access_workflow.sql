-- Migration 098: Requester -> Owner -> DBA access-request workflow
-- =====================================================================
-- The "Access Management" workflow (GRANT_ACCESS/REMOVE_ACCESS) routed
-- through a global "Data Owner" role and then Platform Admin — neither
-- of which reflects who actually owns the specific table being
-- requested, and neither of whom can actually provision access on the
-- source system. Repoints it at the real, per-asset governance Owner
-- (walking the same column->table->schema->source chain already built
-- for GovernancePanel, db/046 + db/097), then a new DBA role for the
-- final "make it happen on the source system" step.

-- 1. New assignee_type: ASSET_OWNER resolves dynamically per request
--    target via bayanat.asset_stakeholders (see lib/workflow.ts),
--    unlike ROLE which only ever resolves a fixed GLOBAL role.
ALTER TABLE bayanat.workflow_stages DROP CONSTRAINT workflow_stages_assignee_type_check;
ALTER TABLE bayanat.workflow_stages ADD CONSTRAINT workflow_stages_assignee_type_check
  CHECK (assignee_type IN ('ROLE','TEAM','USER','REQUESTER','ASSET_OWNER'));

-- 2. New DBA role — no standing privileges of its own, purely a workflow
--    sign-off stage for provisioning/revoking source-system access.
INSERT INTO bayanat.roles (role_name, description, metadata_read, metadata_write, metadata_delete, data_read, is_admin)
VALUES ('Database Administrator', 'Provisions or revokes access directly on the source system once an access request is approved.', TRUE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (role_name) DO NOTHING;

-- 3. Repoint the Access Management workflow's two stages.
DO $$
DECLARE v_dba_role_id INT;
BEGIN
  SELECT role_id INTO v_dba_role_id FROM bayanat.roles WHERE role_name = 'Database Administrator';

  UPDATE bayanat.workflow_stages ws
  SET stage_name_text = 'Owner Review',
      description_text = 'The table''s actual governance Owner reviews and approves the access request',
      assignee_type = 'ASSET_OWNER',
      assignee_role_id = NULL
  FROM bayanat.workflow_definitions wd
  WHERE ws.workflow_id = wd.workflow_id AND wd.workflow_name_text = 'Access Management' AND ws.stage_order = 1;

  UPDATE bayanat.workflow_stages ws
  SET stage_name_text = 'DBA Provisioning',
      description_text = 'DBA provisions (or revokes) the actual access on the source system',
      assignee_type = 'ROLE',
      assignee_role_id = v_dba_role_id
  FROM bayanat.workflow_definitions wd
  WHERE ws.workflow_id = wd.workflow_id AND wd.workflow_name_text = 'Access Management' AND ws.stage_order = 2;
END $$;
