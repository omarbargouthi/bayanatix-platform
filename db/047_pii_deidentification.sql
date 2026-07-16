-- Migration 047: PII de-identification for open data + conditional workflow routing

-- 1. De-identification tracking on open_dataset_columns
ALTER TABLE bayanat.open_dataset_columns
  ADD COLUMN IF NOT EXISTS deidentification_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS deidentification_notes  TEXT;

-- 2. Standard open data workflow (no Privacy Review — for datasets with no PI data)
INSERT INTO bayanat.workflow_definitions (workflow_name_text, description_text)
VALUES ('Open Data Standard Approval', 'Approval for open datasets with no PI data — Steward → Owner → Admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_wf_id INT;
BEGIN
  SELECT workflow_id INTO v_wf_id
  FROM bayanat.workflow_definitions
  WHERE workflow_name_text = 'Open Data Standard Approval';

  IF NOT EXISTS (SELECT 1 FROM bayanat.workflow_stages WHERE workflow_id = v_wf_id) THEN
    INSERT INTO bayanat.workflow_stages
      (workflow_id, stage_name_text, stage_order, required_role_code, is_final, sla_days_count)
    VALUES
      (v_wf_id, 'Steward Review', 1, 'STEWARD', false, 3),
      (v_wf_id, 'Owner Approval', 2, 'OWNER',   false, 5),
      (v_wf_id, 'DMO Sign-off',   3, 'ADMIN',   true,  7);
  END IF;
END;
$$;

-- 3. Re-map PUBLISH_OPEN_DATA to the standard (no-Privacy) workflow
UPDATE bayanat.request_type_workflows
SET workflow_id = (
  SELECT workflow_id FROM bayanat.workflow_definitions
  WHERE workflow_name_text = 'Open Data Standard Approval'
)
WHERE request_type_code = 'PUBLISH_OPEN_DATA';

-- 4. PUBLISH_OPEN_DATA_PI maps to the existing 4-stage workflow (workflow_id=7) that includes Privacy Review
INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id)
VALUES ('PUBLISH_OPEN_DATA_PI', 7)
ON CONFLICT DO NOTHING;
