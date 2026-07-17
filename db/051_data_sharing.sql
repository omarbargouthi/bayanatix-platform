-- ═══════════════════════════════════════════════════════════════════════════════
-- 051_data_sharing.sql
-- Data Sharing Agreements (DSA) feature:
--   data_sharing_agreements, dsa_datasets, dsa_attributes,
--   dsa_authorizations, dsa_approvals
-- Routing rules baked into application layer (see lib/sharing-routing.ts).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── New stakeholder roles ─────────────────────────────────────────────────────
INSERT INTO bayanat.stakeholder_roles (role_code, role_name_text, description_text)
VALUES
  ('DATA_PRIVACY_OFFICER', 'Data Privacy Officer', 'Responsible for PDPL compliance and personal data sharing approval.'),
  ('EXEC_DELEGATE',        'Executive Delegate',   'First officer or documented delegate authorized to sign Secret/Top Secret DSAs.'),
  ('DMO_HEAD',             'DMO Head',             'Head of Data Management Office; signing authority for Confidential/Restricted DSAs.')
ON CONFLICT (role_code) DO NOTHING;

-- ── Confirm classification rank order ────────────────────────────────────────
-- Rank: PUBLIC=1, INTERNAL=2, CONFIDENTIAL=3, RESTRICTED=3, SECRET=4, TOP_SECRET=5
-- Used by the app to find the max classification among shared attributes.
ALTER TABLE bayanat.classification_types
  ADD COLUMN IF NOT EXISTS rank_order INT NOT NULL DEFAULT 1;

UPDATE bayanat.classification_types SET rank_order = CASE
  WHEN class_code ILIKE 'PUBLIC'       THEN 1
  WHEN class_code ILIKE 'INTERNAL'     THEN 2
  WHEN class_code ILIKE 'CONFIDENTIAL' THEN 3
  WHEN class_code ILIKE 'RESTRICTED'   THEN 3
  WHEN class_code ILIKE 'SECRET'       THEN 4
  WHEN class_code ILIKE 'TOP_SECRET'   THEN 5
  ELSE 1
END;

-- ── Main DSA table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.data_sharing_agreements (
  dsa_id                         SERIAL PRIMARY KEY,
  dsa_reference_code             VARCHAR(50)  UNIQUE,             -- e.g. DSA-2026-0042; auto-set on submit
  title_text                     VARCHAR(255) NOT NULL,
  sharing_scope_code             VARCHAR(30)  NOT NULL
    CHECK (sharing_scope_code IN ('INTERNAL','EXTERNAL_GOV','EXTERNAL_PRIVATE')),
  direction_code                 VARCHAR(20)  NOT NULL DEFAULT 'PROVIDER'
    CHECK (direction_code IN ('PROVIDER','REQUESTER')),
  counterparty_name_text         VARCHAR(255),
  counterparty_contact_json      JSONB,                           -- {name, email, phone, clearance_ref}
  purpose_text                   TEXT,
  legal_basis_text               TEXT,
  effective_start_date           DATE,
  effective_end_date             DATE,
  sharing_frequency_code         VARCHAR(20)
    CHECK (sharing_frequency_code IN ('ONE_TIME','DAILY','WEEKLY','MONTHLY','ON_DEMAND','REAL_TIME')),
  sharing_method_code            VARCHAR(30)
    CHECK (sharing_method_code IN ('API','SFTP','GSB','SECURE_PORTAL','ENCRYPTED_MEDIA','DIRECT_DB_LINK')),
  data_format_code               VARCHAR(20)
    CHECK (data_format_code IN ('JSON','XML','CSV','PARQUET','XLSX','PDF','OTHER')),
  -- Computed fields (set by application on submit / re-compute trigger)
  max_classification_code        VARCHAR(20),
  contains_personal_data_indicator BOOLEAN NOT NULL DEFAULT false,
  entity_role_code               VARCHAR(20)
    CHECK (entity_role_code IN ('CONTROLLER','PROCESSOR','MIXED')),
  is_cross_border                BOOLEAN NOT NULL DEFAULT false,  -- hard blocked at gate G-CB
  -- Terms & controls (mandatory before approval)
  security_controls_text         TEXT,
  storage_conditions_text        TEXT,
  destruction_mechanism_text     TEXT,
  liability_terms_text           TEXT,
  review_terms_text              TEXT,
  -- Risk & quality disclosure
  known_dq_issues_json           JSONB,                           -- snapshot at submission
  risk_assessment_ref            VARCHAR(100),                    -- mandatory for EXTERNAL_*
  -- Lifecycle
  status_code                    VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status_code IN (
      'DRAFT','VALIDATION','OWNER_REVIEW','PRIVACY_REVIEW',
      'DMO_REVIEW','EXEC_APPROVAL','APPROVED','ACTIVE',
      'SUSPENDED','TERMINATED','EXPIRED','RENEWAL_DRAFT'
    )),
  signed_document_ref            VARCHAR(255),
  parent_dsa_id                  INT REFERENCES bayanat.data_sharing_agreements(dsa_id),
  -- Audit
  created_by                     VARCHAR(100) REFERENCES bayanat.users(user_id),
  created_at                     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMP NOT NULL DEFAULT NOW(),
  submitted_at                   TIMESTAMP,
  approved_at                    TIMESTAMP,
  activated_at                   TIMESTAMP,
  terminated_at                  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dsa_status   ON bayanat.data_sharing_agreements(status_code);
CREATE INDEX IF NOT EXISTS idx_dsa_scope    ON bayanat.data_sharing_agreements(sharing_scope_code);
CREATE INDEX IF NOT EXISTS idx_dsa_created  ON bayanat.data_sharing_agreements(created_by);
CREATE INDEX IF NOT EXISTS idx_dsa_parent   ON bayanat.data_sharing_agreements(parent_dsa_id);
CREATE INDEX IF NOT EXISTS idx_dsa_expiry   ON bayanat.data_sharing_agreements(effective_end_date) WHERE status_code IN ('ACTIVE','APPROVED');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION bayanat.fn_dsa_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_dsa_updated_at ON bayanat.data_sharing_agreements;
CREATE TRIGGER trg_dsa_updated_at
  BEFORE UPDATE ON bayanat.data_sharing_agreements
  FOR EACH ROW EXECUTE FUNCTION bayanat.fn_dsa_updated_at();

-- ── DSA ↔ Dataset links ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.dsa_datasets (
  dsa_dataset_id        SERIAL PRIMARY KEY,
  dsa_id                INT NOT NULL REFERENCES bayanat.data_sharing_agreements(dsa_id) ON DELETE CASCADE,
  entity_id             INT NOT NULL REFERENCES bayanat.data_entities(entity_id),
  filter_criteria_text  TEXT,                                     -- row-level scope description
  UNIQUE (dsa_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_dsa_datasets_dsa    ON bayanat.dsa_datasets(dsa_id);
CREATE INDEX IF NOT EXISTS idx_dsa_datasets_entity ON bayanat.dsa_datasets(entity_id);

-- ── Explicit attribute list ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.dsa_attributes (
  dsa_attribute_id              SERIAL PRIMARY KEY,
  dsa_dataset_id                INT NOT NULL REFERENCES bayanat.dsa_datasets(dsa_dataset_id) ON DELETE CASCADE,
  attribute_id                  INT NOT NULL REFERENCES bayanat.data_attributes(attribute_id),
  -- Snapshots frozen at submission
  classification_code_snapshot  VARCHAR(20),
  is_personal_data_indicator    BOOLEAN NOT NULL DEFAULT false,
  pi_category_code              VARCHAR(50),
  -- Treatment
  treatment_code                VARCHAR(20) NOT NULL DEFAULT 'AS_IS'
    CHECK (treatment_code IN ('AS_IS','MASKED','ANONYMIZED','PSEUDONYMIZED','AGGREGATED')),
  treatment_notes_text          TEXT,
  UNIQUE (dsa_dataset_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS idx_dsa_attrs_dataset   ON bayanat.dsa_attributes(dsa_dataset_id);
CREATE INDEX IF NOT EXISTS idx_dsa_attrs_attribute ON bayanat.dsa_attributes(attribute_id);

-- ── Controller authorization evidence (for PROCESSOR / MIXED) ────────────────
CREATE TABLE IF NOT EXISTS bayanat.dsa_authorizations (
  authorization_id       SERIAL PRIMARY KEY,
  dsa_id                 INT NOT NULL REFERENCES bayanat.data_sharing_agreements(dsa_id) ON DELETE CASCADE,
  controller_name_text   VARCHAR(255) NOT NULL,
  scope_text             TEXT,
  evidence_document_ref  VARCHAR(255) NOT NULL,                   -- mandatory
  issued_date            DATE,
  valid_until_date       DATE,
  verified_by_user_id    VARCHAR(100) REFERENCES bayanat.users(user_id),
  verified_at            TIMESTAMP,
  created_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dsa_auth_dsa ON bayanat.dsa_authorizations(dsa_id);

-- ── Approval cycle ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.dsa_approvals (
  approval_id              SERIAL PRIMARY KEY,
  dsa_id                   INT NOT NULL REFERENCES bayanat.data_sharing_agreements(dsa_id) ON DELETE CASCADE,
  station_code             VARCHAR(20) NOT NULL
    CHECK (station_code IN ('DATA_OWNER','DATA_PRIVACY','DMO_REVIEW','EXEC_DELEGATE')),
  station_order            INT NOT NULL,                          -- 1=OWNER,2=PRIVACY,3=DMO,4=EXEC
  required_indicator       BOOLEAN NOT NULL DEFAULT true,
  approver_user_id         VARCHAR(100) REFERENCES bayanat.users(user_id),
  decision_code            VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (decision_code IN ('PENDING','APPROVED','REJECTED','RETURNED')),
  decision_timestamp       TIMESTAMP,
  comments_text            TEXT,
  delegation_evidence_ref  VARCHAR(255)                           -- EXEC_DELEGATE only
);

CREATE INDEX IF NOT EXISTS idx_dsa_appr_dsa     ON bayanat.dsa_approvals(dsa_id);
CREATE INDEX IF NOT EXISTS idx_dsa_appr_user    ON bayanat.dsa_approvals(approver_user_id) WHERE decision_code = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_dsa_appr_station ON bayanat.dsa_approvals(station_code, decision_code);

-- ── Sequence for human reference codes ───────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS bayanat.dsa_ref_seq START 1;
