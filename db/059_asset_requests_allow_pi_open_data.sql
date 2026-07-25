-- Migration 059: allow PUBLISH_OPEN_DATA_PI on asset_requests
-- =====================================================================
-- Migration 047 routed PUBLISH_OPEN_DATA_PI to its own approval workflow
-- (request_type_workflows) but never widened the request_type_code CHECK
-- constraint on asset_requests to allow that value. Submitting any open
-- dataset with de-identified PI columns hits the constraint and fails.

ALTER TABLE bayanat.asset_requests
  DROP CONSTRAINT IF EXISTS asset_requests_request_type_code_check;

ALTER TABLE bayanat.asset_requests
  ADD CONSTRAINT asset_requests_request_type_code_check
  CHECK (request_type_code IN (
    'FIX_DATA_ISSUE', 'UPDATE_DEFINITION', 'CERTIFY_ASSET',
    'GRANT_ACCESS',   'REMOVE_ACCESS',     'OTHER',
    'CLASSIFY_ASSET', 'PUBLISH_OPEN_DATA', 'PUBLISH_OPEN_DATA_PI'
  ));
