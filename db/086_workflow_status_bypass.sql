-- Workflow definitions get a Draft/Active/Deactive status (replaces the binary
-- is_active flag). Draft = not yet assignable to a request type. Deactive =
-- assigned request types execute immediately with no approval (see
-- lib/workflow.ts's startWorkflow bypass check).
ALTER TABLE bayanat.workflow_definitions
  ADD COLUMN IF NOT EXISTS status_code VARCHAR(10) NOT NULL DEFAULT 'Active'
    CHECK (status_code IN ('Draft', 'Active', 'Deactive'));

UPDATE bayanat.workflow_definitions
  SET status_code = CASE WHEN is_active THEN 'Active' ELSE 'Deactive' END;

ALTER TABLE bayanat.workflow_definitions
  DROP COLUMN IF EXISTS is_active;

-- Widen for the new compliance-review request type (see 087_compliance_review_workflow.sql).
ALTER TABLE bayanat.asset_requests
  DROP CONSTRAINT IF EXISTS asset_requests_request_type_code_check;

ALTER TABLE bayanat.asset_requests
  ADD CONSTRAINT asset_requests_request_type_code_check
  CHECK (request_type_code IN (
    'FIX_DATA_ISSUE', 'UPDATE_DEFINITION', 'CERTIFY_ASSET',
    'GRANT_ACCESS', 'REMOVE_ACCESS', 'OTHER',
    'CLASSIFY_ASSET', 'PUBLISH_OPEN_DATA', 'PUBLISH_OPEN_DATA_PI',
    'COMPLIANCE_REVIEW'
  ));
