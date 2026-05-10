-- Drop stakeholder_roles FK — workflow stages use system-level role codes (OFFICER, ADMIN, STEWARD, etc.)
ALTER TABLE bayanat.workflow_stages
  DROP CONSTRAINT IF EXISTS workflow_stages_required_role_code_fkey;

-- Extend existing workflow_definitions with missing columns
ALTER TABLE bayanat.workflow_definitions
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN   NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();

-- Extend existing workflow_stages with missing columns
ALTER TABLE bayanat.workflow_stages
  ADD COLUMN IF NOT EXISTS stage_order      INT     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS description_text TEXT,
  ADD COLUMN IF NOT EXISTS assignee_user_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_final         BOOLEAN NOT NULL DEFAULT false;

-- New: maps each request type to exactly one workflow
CREATE TABLE IF NOT EXISTS bayanat.request_type_workflows (
  request_type_code VARCHAR(30) PRIMARY KEY,
  workflow_id       INT NOT NULL REFERENCES bayanat.workflow_definitions(workflow_id)
);

-- New: one running instance per request
CREATE TABLE IF NOT EXISTS bayanat.workflow_instances (
  instance_id      SERIAL PRIMARY KEY,
  workflow_id      INT NOT NULL REFERENCES bayanat.workflow_definitions(workflow_id),
  request_id       INT NOT NULL UNIQUE REFERENCES bayanat.asset_requests(request_id) ON DELETE CASCADE,
  current_stage_id INT  REFERENCES bayanat.workflow_stages(stage_id),
  status_code      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status_code IN ('ACTIVE','COMPLETED','CANCELLED')),
  started_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMP
);

-- New: stage-by-stage audit trail
CREATE TABLE IF NOT EXISTS bayanat.workflow_stage_history (
  history_id             SERIAL PRIMARY KEY,
  instance_id            INT NOT NULL REFERENCES bayanat.workflow_instances(instance_id) ON DELETE CASCADE,
  stage_id               INT NOT NULL REFERENCES bayanat.workflow_stages(stage_id),
  assigned_to_user_id    VARCHAR(255),
  entered_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at           TIMESTAMP,
  completed_by_user_id   VARCHAR(255),
  outcome_code           VARCHAR(20) CHECK (outcome_code IN ('APPROVED','REJECTED','COMPLETED')),
  notes                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_wf_inst_request  ON bayanat.workflow_instances(request_id);
CREATE INDEX IF NOT EXISTS idx_wf_hist_instance ON bayanat.workflow_stage_history(instance_id);
CREATE INDEX IF NOT EXISTS idx_wf_hist_assigned ON bayanat.workflow_stage_history(assigned_to_user_id) WHERE completed_at IS NULL;

-- ── Seed ─────────────────────────────────────────────────────────────────────

INSERT INTO bayanat.workflow_definitions (workflow_name_text, description_text) VALUES
  ('Data Issue Resolution', 'End-to-end process for investigating and fixing data quality issues'),
  ('Metadata Update',       'Review and approval process for updating asset definitions and metadata'),
  ('Asset Certification',   'Formal certification workflow for metadata and data quality compliance'),
  ('Access Management',     'Request, review and approval for granting or revoking data access'),
  ('General Request',       'Default review workflow for general or uncategorised requests');

DO $$
DECLARE
  wid1 INT; wid2 INT; wid3 INT; wid4 INT; wid5 INT;
BEGIN
  SELECT workflow_id INTO wid1 FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Data Issue Resolution';
  SELECT workflow_id INTO wid2 FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Metadata Update';
  SELECT workflow_id INTO wid3 FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Asset Certification';
  SELECT workflow_id INTO wid4 FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Access Management';
  SELECT workflow_id INTO wid5 FROM bayanat.workflow_definitions WHERE workflow_name_text = 'General Request';

  INSERT INTO bayanat.workflow_stages
    (workflow_id, stage_order, stage_name_text, description_text, required_role_code, sla_days_count, is_final)
  VALUES
    (wid1, 1,'Triage',        'Classify severity and assign investigator',          'STEWARD', 1, false),
    (wid1, 2,'Investigation', 'Root-cause analysis and impact assessment',           'STEWARD', 2, false),
    (wid1, 3,'Fix',           'Implement the remediation or data correction',        'STEWARD', 3, false),
    (wid1, 4,'Verification',  'Officer confirms fix meets quality standards',        'OFFICER', 1, false),
    (wid1, 5,'Close',         'Final closure and documentation',                    'OFFICER', 1, true),

    (wid2, 1,'Draft Update',  'Steward prepares the updated definition or metadata', 'STEWARD', 2, false),
    (wid2, 2,'Review',        'Officer reviews the proposed update for accuracy',    'OFFICER', 1, false),
    (wid2, 3,'Approve',       'Admin approves and publishes the updated metadata',   'ADMIN',   1, true),

    (wid3, 1,'Prepare',       'Steward assembles evidence and documentation',        'STEWARD', 2, false),
    (wid3, 2,'Review',        'Officer validates completeness and accuracy',         'OFFICER', 2, false),
    (wid3, 3,'Certify',       'Admin issues the certification badge',                'ADMIN',   1, true),

    (wid4, 1,'Review Request','Owner evaluates the access request rationale',        'OWNER',   2, false),
    (wid4, 2,'Approve',       'Admin approves or rejects the access change',         'ADMIN',   1, true),

    (wid5, 1,'Review',        'Officer reviews and acts on the request',             'OFFICER', 2, false),
    (wid5, 2,'Close',         'Outcome documented and request closed',               'OFFICER', 1, true);

  INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id) VALUES
    ('FIX_DATA_ISSUE',    wid1),
    ('UPDATE_DEFINITION', wid2),
    ('CERTIFY_ASSET',     wid3),
    ('GRANT_ACCESS',      wid4),
    ('REMOVE_ACCESS',     wid4),
    ('OTHER',             wid5);
END $$;
