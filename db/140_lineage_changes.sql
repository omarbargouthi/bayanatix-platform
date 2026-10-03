-- Manual lineage now goes through approval with a full history:
--  * LINEAGE_CHANGE — a proposed set of manual lineage changes (from the Add
--    Lineage dialog, the Mapping Register or an Excel import), applied only when
--    the mapped workflow approves it. With no workflow mapped the changes apply
--    immediately (same convention as every other request type) but are still
--    recorded here.
--  * LINEAGE_REVIEW — "this link doesn't look right": a review request raised
--    against any lineage link (scanned or manual) instead of deleting it.
--  bayanat.lineage_changes is both the pending queue and the change history.

ALTER TABLE bayanat.asset_requests DROP CONSTRAINT IF EXISTS asset_requests_request_type_code_check;
ALTER TABLE bayanat.asset_requests ADD CONSTRAINT asset_requests_request_type_code_check CHECK (
  request_type_code IN (
    'FIX_DATA_ISSUE', 'UPDATE_DEFINITION', 'CERTIFY_ASSET', 'GRANT_ACCESS', 'REMOVE_ACCESS', 'OTHER',
    'CLASSIFY_ASSET', 'PUBLISH_OPEN_DATA', 'PUBLISH_OPEN_DATA_PI', 'COMPLIANCE_REVIEW', 'PI_CLEAR_TEXT_ACCESS',
    'OVERRIDE_GLOSSARY_GOVERNANCE', 'METADATA_UPDATE', 'CHANGE_IMPACT_REVIEW', 'LINEAGE_CHANGE', 'LINEAGE_REVIEW'
  )
);

CREATE TABLE IF NOT EXISTS bayanat.lineage_changes (
  change_id                 serial PRIMARY KEY,
  request_id                integer REFERENCES bayanat.asset_requests(request_id) ON DELETE SET NULL,
  op_code                   varchar(10) NOT NULL CHECK (op_code IN ('CREATE', 'UPDATE', 'DELETE')),
  lineage_id                integer,            -- the edge changed (set on apply for CREATE); kept after a DELETE for history
  lineage_scope_code        varchar(20) NOT NULL,
  source_asset_id           integer NOT NULL,
  target_asset_id           integer NOT NULL,
  transformation_type_code  varchar(20),
  transformation_logic_text text,
  keep_existing             boolean NOT NULL DEFAULT false, -- CREATE only: don't overwrite an existing edge's type/logic
  previous_json             jsonb,              -- the edge as it was just before an UPDATE/DELETE was applied
  status_code               varchar(12) NOT NULL DEFAULT 'PENDING' CHECK (status_code IN ('PENDING', 'APPLIED', 'REJECTED')),
  origin_code               varchar(12) NOT NULL CHECK (origin_code IN ('DIALOG', 'REGISTER', 'IMPORT')),
  change_note               text,
  requested_by_user_id      varchar(100) NOT NULL,
  requested_at              timestamptz NOT NULL DEFAULT now(),
  decided_at                timestamptz
);
CREATE INDEX IF NOT EXISTS ix_lineage_changes_lineage ON bayanat.lineage_changes (lineage_id);
CREATE INDEX IF NOT EXISTS ix_lineage_changes_pending ON bayanat.lineage_changes (status_code) WHERE status_code = 'PENDING';
CREATE INDEX IF NOT EXISTS ix_lineage_changes_request ON bayanat.lineage_changes (request_id);
