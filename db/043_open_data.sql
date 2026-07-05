-- =====================================================================
-- Migration 043: Open Data publishing feature
-- =====================================================================

-- ── Extend asset_requests to accept PUBLISH_OPEN_DATA ────────────────
ALTER TABLE bayanat.asset_requests
  DROP CONSTRAINT IF EXISTS asset_requests_request_type_code_check;

ALTER TABLE bayanat.asset_requests
  ADD CONSTRAINT asset_requests_request_type_code_check
  CHECK (request_type_code IN (
    'FIX_DATA_ISSUE', 'UPDATE_DEFINITION', 'CERTIFY_ASSET',
    'GRANT_ACCESS',   'REMOVE_ACCESS',     'OTHER',
    'CLASSIFY_ASSET', 'PUBLISH_OPEN_DATA'
  ));

-- ── Main open dataset table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.open_datasets (
  dataset_id           SERIAL PRIMARY KEY,
  dataset_name_text    VARCHAR(200) NOT NULL,
  description_text     TEXT,
  department_text      VARCHAR(200),
  domain_code          VARCHAR(40) REFERENCES bayanat.governance_domains(domain_code),
  purpose_text         TEXT,
  beneficiary_segments JSONB        NOT NULL DEFAULT '[]',
  publish_date         DATE,
  coverage_from_year   SMALLINT,
  coverage_to_year     SMALLINT,
  data_formats         JSONB        NOT NULL DEFAULT '[]',
  data_size_text       VARCHAR(100),
  refresh_frequency    VARCHAR(20)
    CHECK (refresh_frequency IN ('MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','ON_DEMAND')),
  dq_notes_text        TEXT,
  extraction_logic     TEXT,
  status_code          VARCHAR(30)  NOT NULL DEFAULT 'DRAFT'
    CHECK (status_code IN ('DRAFT','PENDING_APPROVAL','APPROVED','PUBLISHED','REJECTED','PENDING')),
  raised_by_user_id    VARCHAR(255) NOT NULL,
  created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ── Columns selected for this dataset ────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.open_dataset_columns (
  od_column_id   SERIAL PRIMARY KEY,
  dataset_id     INT NOT NULL REFERENCES bayanat.open_datasets(dataset_id) ON DELETE CASCADE,
  attribute_id   INT NOT NULL REFERENCES bayanat.data_attributes(attribute_id),
  publish_name   VARCHAR(200),
  publish_desc   TEXT,
  sort_order     INT NOT NULL DEFAULT 0,
  added_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (dataset_id, attribute_id)
);

-- ── DQ issues noted at column level within the dataset ───────────────
CREATE TABLE IF NOT EXISTS bayanat.open_dataset_dq_issues (
  issue_id       SERIAL PRIMARY KEY,
  dataset_id     INT NOT NULL REFERENCES bayanat.open_datasets(dataset_id) ON DELETE CASCADE,
  attribute_id   INT REFERENCES bayanat.data_attributes(attribute_id),
  dimension_code VARCHAR(20) REFERENCES bayanat.dq_dimensions(dimension_code),
  issue_text     TEXT NOT NULL,
  severity_code  VARCHAR(20) NOT NULL DEFAULT 'WARNING'
    CHECK (severity_code IN ('BLOCKER','WARNING','INFO')),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_od_columns_dataset   ON bayanat.open_dataset_columns(dataset_id);
CREATE INDEX IF NOT EXISTS idx_od_dq_dataset        ON bayanat.open_dataset_dq_issues(dataset_id);
CREATE INDEX IF NOT EXISTS idx_od_status            ON bayanat.open_datasets(status_code);
CREATE INDEX IF NOT EXISTS idx_od_raised_by         ON bayanat.open_datasets(raised_by_user_id);

-- ── Open Data Approval workflow ───────────────────────────────────────
-- 4 stages: Steward → Owner → Privacy Officer (critical if PII) → DMO

INSERT INTO bayanat.workflow_definitions (workflow_name_text, description_text, is_active)
VALUES ('Open Data Approval',
        'Four-stage open data publication review: Steward → Owner → Privacy Officer → DMO Admin',
        true)
ON CONFLICT DO NOTHING;

DO $$
DECLARE wid INT;
BEGIN
  SELECT workflow_id INTO wid
    FROM bayanat.workflow_definitions
   WHERE workflow_name_text = 'Open Data Approval';
  IF wid IS NULL THEN RETURN; END IF;

  INSERT INTO bayanat.workflow_stages
    (workflow_id, stage_order, stage_name_text, description_text, required_role_code, sla_days_count, is_final)
  VALUES
    (wid, 1, 'Steward Review',   'Data steward reviews columns, quality notes, and extraction logic', 'STEWARD', 3,  false),
    (wid, 2, 'Owner Approval',   'Data owner approves the dataset scope and publication details',      'OWNER',   5,  false),
    (wid, 3, 'Privacy Review',   'Data Privacy Officer reviews PI/PII columns — required if any PII', 'OFFICER', 3,  false),
    (wid, 4, 'DMO Sign-off',     'DMO Admin gives final approval to publish the open dataset',         'ADMIN',   3,  true )
  ON CONFLICT DO NOTHING;

  INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id)
  VALUES ('PUBLISH_OPEN_DATA', wid)
  ON CONFLICT DO NOTHING;
END $$;
