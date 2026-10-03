-- New request type for the lineage "Assess a planned change" flow: before a
-- column or table is changed, the owners of every downstream asset it feeds
-- get a review request so they can fix/confirm their side. Mappable to a
-- workflow in Admin > Workflows like any other request type.

ALTER TABLE bayanat.asset_requests DROP CONSTRAINT IF EXISTS asset_requests_request_type_code_check;
ALTER TABLE bayanat.asset_requests ADD CONSTRAINT asset_requests_request_type_code_check CHECK (
  request_type_code IN (
    'FIX_DATA_ISSUE', 'UPDATE_DEFINITION', 'CERTIFY_ASSET', 'GRANT_ACCESS', 'REMOVE_ACCESS', 'OTHER',
    'CLASSIFY_ASSET', 'PUBLISH_OPEN_DATA', 'PUBLISH_OPEN_DATA_PI', 'COMPLIANCE_REVIEW', 'PI_CLEAR_TEXT_ACCESS',
    'OVERRIDE_GLOSSARY_GOVERNANCE', 'METADATA_UPDATE', 'CHANGE_IMPACT_REVIEW'
  )
);
