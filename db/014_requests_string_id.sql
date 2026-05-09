-- Allow string asset IDs (governance domain codes, glossary domains, future policy IDs)
ALTER TABLE bayanat.asset_request_targets
  ALTER COLUMN asset_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS asset_id_text VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_art_asset_text ON bayanat.asset_request_targets(asset_type_code, asset_id_text)
  WHERE asset_id_text IS NOT NULL;

-- Seed domain-level requests against the existing governance domains
DO $$
DECLARE
  v_uid TEXT;
  v_r   INT;
BEGIN
  SELECT user_id INTO v_uid FROM bayanat.users LIMIT 1;
  IF v_uid IS NULL THEN RETURN; END IF;

  -- HIGH: data quality issue in the Data Quality domain
  INSERT INTO bayanat.asset_requests
    (request_type_code, title, description_text, priority_code, status_code, raised_by_user_id)
  VALUES
    ('FIX_DATA_ISSUE',
     'DQ rule failures exceeding 15% threshold in core financial tables',
     'Several DQ rules are failing above the acceptable threshold defined in the DQ policy. Requires immediate investigation and remediation plan.',
     'HIGH', 'OPEN', v_uid)
  RETURNING request_id INTO v_r;
  INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id_text, asset_name)
  VALUES (v_r, 'GOVERNANCE_DOMAIN', 'DQ', 'Data Quality');

  -- HIGH: missing metadata certification in Data Catalog domain
  INSERT INTO bayanat.asset_requests
    (request_type_code, title, description_text, priority_code, status_code, raised_by_user_id)
  VALUES
    ('CERTIFY_ASSET',
     'Batch certification required for 47 uncertified tables',
     '47 tables in the Data Catalog have no metadata certification. Compliance review requires all published assets to be certified before Q4.',
     'HIGH', 'IN_PROGRESS', v_uid)
  RETURNING request_id INTO v_r;
  INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id_text, asset_name)
  VALUES (v_r, 'GOVERNANCE_DOMAIN', 'DCAT', 'Data Catalog');

  -- MEDIUM: update definition for Master Data domain
  INSERT INTO bayanat.asset_requests
    (request_type_code, title, description_text, priority_code, status_code, raised_by_user_id)
  VALUES
    ('UPDATE_DEFINITION',
     'Master data glossary terms need business owner assignment',
     '23 master data entities are missing business owner designations. Required for NDI maturity assessment next month.',
     'MEDIUM', 'OPEN', v_uid)
  RETURNING request_id INTO v_r;
  INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id_text, asset_name)
  VALUES (v_r, 'GOVERNANCE_DOMAIN', 'MDM', 'Master Data Management');

  -- MEDIUM: grant access for Data Privacy domain
  INSERT INTO bayanat.asset_requests
    (request_type_code, title, description_text, priority_code, status_code, raised_by_user_id)
  VALUES
    ('GRANT_ACCESS',
     'Privacy team requires access to PII classification reports',
     'The privacy compliance team needs read access to the PII classification layer to complete the PDPL gap assessment.',
     'MEDIUM', 'OPEN', v_uid)
  RETURNING request_id INTO v_r;
  INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id_text, asset_name)
  VALUES (v_r, 'GOVERNANCE_DOMAIN', 'PDP', 'Data Privacy (PDPL)');

  -- LOW: data sharing domain
  INSERT INTO bayanat.asset_requests
    (request_type_code, title, description_text, priority_code, status_code, raised_by_user_id)
  VALUES
    ('OTHER',
     'Review data sharing agreements for external partners',
     'Existing data sharing MOUs with 3 external entities are expiring and need legal review before renewal.',
     'LOW', 'OPEN', v_uid)
  RETURNING request_id INTO v_r;
  INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id_text, asset_name)
  VALUES (v_r, 'GOVERNANCE_DOMAIN', 'DSH', 'Data Sharing');
END $$;
