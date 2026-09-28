-- Migration 117: Rescan change-detection workflow + soft-delete lifecycle status
-- =====================================================================
-- Re-crawling a data source used to hard-DELETE any table/column no longer
-- found in the live source, losing history and any reference to it (audit
-- logs, past requests, DQ rules). Adds a real lifecycle status instead of a
-- free-form tag (tags here are user-editable and drive no filtering), plus a
-- new METADATA_UPDATE request type + ASSET_STEWARD assignee type so a
-- rescan's changes can route to a table's steward(s) for review.

-- 1. Lifecycle status on tables/columns (schemas/sources intentionally not
--    touched — out of scope; a whole schema disappearing keeps today's
--    hard-delete-cascade behavior).
ALTER TABLE bayanat.data_entities
  ADD COLUMN IF NOT EXISTS lifecycle_status_code TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (lifecycle_status_code IN ('ACTIVE', 'DEPRECATED')),
  ADD COLUMN IF NOT EXISTS deprecated_at_timestamp TIMESTAMPTZ;

ALTER TABLE bayanat.data_attributes
  ADD COLUMN IF NOT EXISTS lifecycle_status_code TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (lifecycle_status_code IN ('ACTIVE', 'DEPRECATED')),
  ADD COLUMN IF NOT EXISTS deprecated_at_timestamp TIMESTAMPTZ;

-- 2. New request type for schema-change review.
ALTER TABLE bayanat.asset_requests
  DROP CONSTRAINT IF EXISTS asset_requests_request_type_code_check;

ALTER TABLE bayanat.asset_requests
  ADD CONSTRAINT asset_requests_request_type_code_check
  CHECK (request_type_code IN (
    'FIX_DATA_ISSUE', 'UPDATE_DEFINITION', 'CERTIFY_ASSET',
    'GRANT_ACCESS',   'REMOVE_ACCESS',     'OTHER',
    'CLASSIFY_ASSET', 'PUBLISH_OPEN_DATA', 'PUBLISH_OPEN_DATA_PI',
    'COMPLIANCE_REVIEW', 'PI_CLEAR_TEXT_ACCESS', 'OVERRIDE_GLOSSARY_GOVERNANCE',
    'METADATA_UPDATE'
  ));

-- 3. New ASSET_STEWARD assignee type — like ASSET_OWNER (dynamically resolved
--    per request target via governance resolvers, see lib/workflow.ts) but
--    reaching every effective stakeholder (Owner + Business Steward +
--    Technical Steward), not just the Owner.
ALTER TABLE bayanat.workflow_stages DROP CONSTRAINT IF EXISTS workflow_stages_assignee_type_check;
ALTER TABLE bayanat.workflow_stages ADD CONSTRAINT workflow_stages_assignee_type_check
  CHECK (assignee_type IN ('ROLE','TEAM','USER','REQUESTER','ASSET_OWNER','ASSET_STEWARD'));
