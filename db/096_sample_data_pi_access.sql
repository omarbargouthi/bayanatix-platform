-- Migration 096: Live Sample Data tab + PI clear-text access workflow
-- =====================================================================
-- 1. Singleton config row for the Sample Data tab's record count (Admin >
--    Configuration > Sample Data).
-- 2. A new "special configuration" role privilege (pii_clear_text_allowed)
--    that opts a role into being ELIGIBLE to request PI clear-text viewing —
--    separate from actually being granted it, which still requires the
--    Admin -> Data Privacy Officer -> DMO Manager approval workflow below.
-- 3. bayanat.pi_access_grants — durable record of an approved clear-text
--    grant for one user on one asset, created when that workflow resolves.
-- 4. New request type PI_CLEAR_TEXT_ACCESS on the existing generic
--    workflow engine (workflow_definitions/workflow_stages/
--    request_type_workflows/asset_requests) — the same framework already
--    used for GRANT_ACCESS, CERTIFY_ASSET, COMPLIANCE_REVIEW, etc.

-- ── 1. Sample Data settings (singleton row, mirrors bayanat.enrichment_settings) ──

CREATE TABLE IF NOT EXISTS bayanat.sample_data_settings (
  settings_id         int4 PRIMARY KEY DEFAULT 1,
  sample_record_count int4 NOT NULL DEFAULT 20,
  CONSTRAINT sample_data_settings_single_row CHECK (settings_id = 1),
  CONSTRAINT sample_data_settings_count_positive CHECK (sample_record_count > 0)
);

INSERT INTO bayanat.sample_data_settings (settings_id) VALUES (1) ON CONFLICT (settings_id) DO NOTHING;

-- ── 2. New role privilege: eligibility to request PI clear-text access ──────────

ALTER TABLE bayanat.roles
  ADD COLUMN IF NOT EXISTS pii_clear_text_allowed BOOLEAN NOT NULL DEFAULT FALSE;

-- New approver roles for the workflow below. Distinct from the existing
-- 'Compliance Officer' role — Data Privacy Officer and DMO Manager are
-- dedicated sign-off stages for this specific approval chain.
INSERT INTO bayanat.roles (role_name, description, metadata_read, metadata_write, metadata_delete, data_read, is_admin)
VALUES
  ('Data Privacy Officer', 'Reviews and approves requests to view PI/PII data as clear text.', TRUE, FALSE, FALSE, FALSE, FALSE),
  ('DMO Manager',          'Final sign-off authority for PI clear-text access requests.',      TRUE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (role_name) DO NOTHING;

-- ── 3. Durable PI clear-text access grants ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.pi_access_grants (
  grant_id        SERIAL PRIMARY KEY,
  user_id         VARCHAR(255) NOT NULL,
  asset_type_code VARCHAR(50)  NOT NULL,
  asset_id        INT          NOT NULL,
  request_id      INT REFERENCES bayanat.asset_requests(request_id) ON DELETE SET NULL,
  purpose_text    TEXT,
  granted_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_access_grants_lookup
  ON bayanat.pi_access_grants(user_id, asset_type_code, asset_id);

-- ── 4. PI_CLEAR_TEXT_ACCESS request type + workflow ──────────────────────────────

ALTER TABLE bayanat.asset_requests
  DROP CONSTRAINT IF EXISTS asset_requests_request_type_code_check;

ALTER TABLE bayanat.asset_requests
  ADD CONSTRAINT asset_requests_request_type_code_check
  CHECK (request_type_code IN (
    'FIX_DATA_ISSUE', 'UPDATE_DEFINITION', 'CERTIFY_ASSET',
    'GRANT_ACCESS',   'REMOVE_ACCESS',     'OTHER',
    'CLASSIFY_ASSET', 'PUBLISH_OPEN_DATA', 'PUBLISH_OPEN_DATA_PI',
    'COMPLIANCE_REVIEW', 'PI_CLEAR_TEXT_ACCESS'
  ));

INSERT INTO bayanat.workflow_definitions (workflow_name_text, description_text)
SELECT 'PI Clear-Text Access Approval',
       'Approval chain for viewing PI/PII sample data as clear text: Admin -> Data Privacy Officer -> DMO Manager'
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.workflow_definitions WHERE workflow_name_text = 'PI Clear-Text Access Approval'
);

DO $$
DECLARE
  v_wf_id     INT;
  v_admin_id  INT;
  v_dpo_id    INT;
  v_dmo_id    INT;
BEGIN
  SELECT workflow_id INTO v_wf_id FROM bayanat.workflow_definitions WHERE workflow_name_text = 'PI Clear-Text Access Approval';
  SELECT role_id INTO v_admin_id FROM bayanat.roles WHERE role_name = 'Platform Admin';
  SELECT role_id INTO v_dpo_id   FROM bayanat.roles WHERE role_name = 'Data Privacy Officer';
  SELECT role_id INTO v_dmo_id   FROM bayanat.roles WHERE role_name = 'DMO Manager';

  IF v_wf_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bayanat.workflow_stages WHERE workflow_id = v_wf_id) THEN
    INSERT INTO bayanat.workflow_stages
      (workflow_id, stage_order, stage_name_text, description_text, assignee_type, assignee_role_id, sla_days_count, is_final)
    VALUES
      (v_wf_id, 1, 'Admin Review',        'Platform Admin reviews the requested purpose of use',        'ROLE', v_admin_id, 2, false),
      (v_wf_id, 2, 'Privacy Officer Review','Data Privacy Officer assesses the privacy justification',   'ROLE', v_dpo_id,   3, false),
      (v_wf_id, 3, 'DMO Sign-off',        'DMO Manager gives final approval to grant clear-text access', 'ROLE', v_dmo_id,   3, true);
  END IF;

  INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id)
  VALUES ('PI_CLEAR_TEXT_ACCESS', v_wf_id)
  ON CONFLICT (request_type_code) DO UPDATE SET workflow_id = EXCLUDED.workflow_id;
END $$;
