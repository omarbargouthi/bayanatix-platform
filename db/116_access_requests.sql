-- ─────────────────────────────────────────────────────────────────────────────
-- 116_access_requests.sql
-- Structured, auto-granting access requests — distinct from the free-form
-- AssetRequest/GRANT_ACCESS ticket system (bayanat.asset_requests), which
-- never automatically grants anything on resolution. A request here is either for
-- one of the six feature domains (approved by a domain-write holder — see
-- resource_type='DOMAIN' in bayanat.role_assignments) or a Data Source /
-- Schema / Table (always approved by that data source's OWNER stakeholder,
-- regardless of how narrow the request is).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.access_requests (
    request_id          SERIAL       PRIMARY KEY,
    requester_user_id   TEXT         NOT NULL REFERENCES bayanat.users(user_id),
    request_kind        TEXT         NOT NULL CHECK (request_kind IN ('DOMAIN','CATALOG')),
    domain_code         TEXT,        -- set when request_kind = 'DOMAIN'
    resource_type       TEXT         CHECK (resource_type IN ('DATA_SOURCE','SCHEMA','TABLE')), -- set when request_kind = 'CATALOG'
    resource_id         TEXT,
    resource_name       TEXT,
    justification_text  TEXT,
    status_code         TEXT         NOT NULL DEFAULT 'PENDING' CHECK (status_code IN ('PENDING','APPROVED','REJECTED')),
    decided_by_user_id  TEXT         REFERENCES bayanat.users(user_id),
    decided_at          TIMESTAMPTZ,
    decision_note_text  TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ar_kind_fields CHECK (
        (request_kind = 'DOMAIN'  AND domain_code IS NOT NULL AND resource_type IS NULL) OR
        (request_kind = 'CATALOG' AND resource_type IS NOT NULL AND resource_id IS NOT NULL AND domain_code IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS ar_requester_idx ON bayanat.access_requests (requester_user_id);
CREATE INDEX IF NOT EXISTS ar_status_idx    ON bayanat.access_requests (status_code) WHERE status_code = 'PENDING';
