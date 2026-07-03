-- Add CLASSIFY_ASSET request type
ALTER TABLE bayanat.asset_requests
  DROP CONSTRAINT IF EXISTS asset_requests_request_type_code_check;

ALTER TABLE bayanat.asset_requests
  ADD CONSTRAINT asset_requests_request_type_code_check
  CHECK (request_type_code IN (
    'FIX_DATA_ISSUE', 'UPDATE_DEFINITION', 'CERTIFY_ASSET',
    'GRANT_ACCESS',   'REMOVE_ACCESS',     'OTHER', 'CLASSIFY_ASSET'
  ));

-- Classification Review workflow: Steward → Owner → Admin
INSERT INTO bayanat.workflow_definitions (workflow_name_text, description_text, is_active)
VALUES ('Classification Review', 'Three-stage classification review: Steward submits → Owner approves → DMO Admin signs off', true)
ON CONFLICT DO NOTHING;

DO $$
DECLARE wid INT;
BEGIN
  SELECT workflow_id INTO wid
    FROM bayanat.workflow_definitions
   WHERE workflow_name_text = 'Classification Review';
  IF wid IS NULL THEN RETURN; END IF;

  INSERT INTO bayanat.workflow_stages
    (workflow_id, stage_order, stage_name_text, description_text, required_role_code, sla_days_count, is_final)
  VALUES
    (wid, 1, 'Steward Review', 'Data steward reviews and confirms the classification assignment', 'STEWARD', 2, false),
    (wid, 2, 'Owner Approval', 'Data owner reviews and approves the proposed classification',    'OWNER',   3, false),
    (wid, 3, 'Admin Sign-off', 'DMO Admin gives final sign-off on the classification',           'ADMIN',   2, true )
  ON CONFLICT DO NOTHING;

  INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id)
  VALUES ('CLASSIFY_ASSET', wid)
  ON CONFLICT DO NOTHING;
END $$;
