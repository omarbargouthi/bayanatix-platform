-- Compliance review moves onto the standard workflow engine (workflow_definitions/
-- workflow_stages/request_type_workflows/workflow_instances), replacing the
-- bespoke bayanat.compliance_workflow table. See lib/queries/gov-compliance.ts.

-- Which asset_requests row is the current/most-recent review cycle for a
-- requirement. NULL = never submitted (DRAFT). Not unique — a requirement can
-- go through multiple review cycles (e.g. after a rejection), only the latest
-- is tracked here.
ALTER TABLE bayanat.gov_compliance_requirements
  ADD COLUMN IF NOT EXISTS review_request_id INT
    REFERENCES bayanat.asset_requests(request_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gcr_review_request ON bayanat.gov_compliance_requirements(review_request_id);

-- Seed the "Compliance Review" workflow: 2 stages (Confirm, Endorse) — "submit"
-- isn't a stage, it's what creates the asset_requests row in the first place.
INSERT INTO bayanat.workflow_definitions (workflow_name_text, description_text, status_code)
SELECT 'Compliance Review',
       'Two-stage review for submitted compliance evidence: Confirm by Steward/Admin, then Endorse by Admin',
       'Active'
WHERE NOT EXISTS (SELECT 1 FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Compliance Review');

DO $$
DECLARE wid INT;
BEGIN
  SELECT workflow_id INTO wid FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Compliance Review';
  IF wid IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM bayanat.workflow_stages WHERE workflow_id = wid) THEN
    INSERT INTO bayanat.workflow_stages
      (workflow_id, stage_order, stage_name_text, description_text, required_role_code, sla_days_count, is_final)
    VALUES
      (wid, 1, 'Confirm', 'Steward or Admin confirms the submitted evidence is adequate', 'STEWARD', 2, false),
      (wid, 2, 'Endorse', 'Admin gives final endorsement on the compliance requirement', 'ADMIN', 2, true);
  END IF;

  INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id)
  VALUES ('COMPLIANCE_REVIEW', wid)
  ON CONFLICT (request_type_code) DO UPDATE SET workflow_id = EXCLUDED.workflow_id;
END $$;

-- Retire the bespoke table (rename, not drop — it has real rows in some environments).
ALTER TABLE IF EXISTS bayanat.compliance_workflow RENAME TO compliance_workflow_deprecated;
