-- Unified request / issue tracking system for data assets
-- Covers: fix data issues, update definitions, certify asset, grant/remove access

CREATE TABLE IF NOT EXISTS bayanat.asset_requests (
  request_id          SERIAL PRIMARY KEY,
  request_type_code   VARCHAR(30) NOT NULL
    CHECK (request_type_code IN (
      'FIX_DATA_ISSUE', 'UPDATE_DEFINITION',
      'CERTIFY_ASSET',  'GRANT_ACCESS',
      'REMOVE_ACCESS',  'OTHER'
    )),
  title               TEXT NOT NULL,
  description_text    TEXT,
  priority_code       VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority_code IN ('HIGH', 'MEDIUM', 'LOW')),
  status_code         VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status_code IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  raised_by_user_id   VARCHAR(255) NOT NULL,
  assigned_to_user_id VARCHAR(255),
  resolution_notes    TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Many-to-many: one request can target multiple assets
CREATE TABLE IF NOT EXISTS bayanat.asset_request_targets (
  target_id       SERIAL PRIMARY KEY,
  request_id      INT  NOT NULL REFERENCES bayanat.asset_requests(request_id) ON DELETE CASCADE,
  asset_type_code VARCHAR(50) NOT NULL,
  asset_id        INT  NOT NULL,
  asset_name      TEXT          -- cached display name
);

CREATE INDEX IF NOT EXISTS idx_art_asset   ON bayanat.asset_request_targets(asset_type_code, asset_id);
CREATE INDEX IF NOT EXISTS idx_art_request ON bayanat.asset_request_targets(request_id);
CREATE INDEX IF NOT EXISTS idx_ar_raiser   ON bayanat.asset_requests(raised_by_user_id);
CREATE INDEX IF NOT EXISTS idx_ar_status   ON bayanat.asset_requests(status_code);

-- Seed sample requests against the first few entities
DO $$
DECLARE
  v_uid  TEXT;
  v_e1   INT; v_e2 INT; v_e3 INT; v_e4 INT;
  v_r    INT;
BEGIN
  SELECT user_id      INTO v_uid FROM bayanat.users        LIMIT 1;
  SELECT entity_id    INTO v_e1  FROM bayanat.data_entities LIMIT 1;
  SELECT entity_id    INTO v_e2  FROM bayanat.data_entities OFFSET 1 LIMIT 1;
  SELECT entity_id    INTO v_e3  FROM bayanat.data_entities OFFSET 2 LIMIT 1;
  SELECT entity_id    INTO v_e4  FROM bayanat.data_entities OFFSET 3 LIMIT 1;

  IF v_uid IS NULL OR v_e1 IS NULL THEN RETURN; END IF;

  -- Request 1: HIGH priority data issue on e1
  INSERT INTO bayanat.asset_requests
    (request_type_code, title, description_text, priority_code, status_code, raised_by_user_id)
  VALUES
    ('FIX_DATA_ISSUE',
     'Null values found in required key columns',
     '~2,340 rows have NULL in the primary identifier column. Impacts downstream reconciliation jobs.',
     'HIGH', 'OPEN', v_uid)
  RETURNING request_id INTO v_r;
  INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
    SELECT v_r, 'DATA_ENTITIES', entity_id, entity_name_text FROM bayanat.data_entities WHERE entity_id = v_e1;

  -- Request 2: MEDIUM — update definition on e2 + e3
  INSERT INTO bayanat.asset_requests
    (request_type_code, title, description_text, priority_code, status_code, raised_by_user_id)
  VALUES
    ('UPDATE_DEFINITION',
     'Add business glossary terms and ownership',
     'These tables are used in regulatory reporting but have no business owner or term mappings defined.',
     'MEDIUM', 'OPEN', v_uid)
  RETURNING request_id INTO v_r;
  INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
    SELECT v_r, 'DATA_ENTITIES', entity_id, entity_name_text FROM bayanat.data_entities WHERE entity_id = v_e2;
  IF v_e3 IS NOT NULL THEN
    INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
      SELECT v_r, 'DATA_ENTITIES', entity_id, entity_name_text FROM bayanat.data_entities WHERE entity_id = v_e3;
  END IF;

  -- Request 3: HIGH — certify asset, in-progress
  INSERT INTO bayanat.asset_requests
    (request_type_code, title, description_text, priority_code, status_code, raised_by_user_id)
  VALUES
    ('CERTIFY_ASSET',
     'Gold certification needed before Q3 close',
     'Finance requires Gold metadata + data certification on this table before the quarterly reporting deadline.',
     'HIGH', 'IN_PROGRESS', v_uid)
  RETURNING request_id INTO v_r;
  INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
    SELECT v_r, 'DATA_ENTITIES', entity_id, entity_name_text FROM bayanat.data_entities WHERE entity_id = v_e1;

  -- Request 4: LOW — grant access on e4
  IF v_e4 IS NOT NULL THEN
    INSERT INTO bayanat.asset_requests
      (request_type_code, title, description_text, priority_code, status_code, raised_by_user_id)
    VALUES
      ('GRANT_ACCESS',
       'Analytics team needs read access',
       'The BI team is building dashboards and requires read access to this dataset.',
       'LOW', 'OPEN', v_uid)
    RETURNING request_id INTO v_r;
    INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
      SELECT v_r, 'DATA_ENTITIES', entity_id, entity_name_text FROM bayanat.data_entities WHERE entity_id = v_e4;
  END IF;

  -- Request 5: MEDIUM — fix definition on e3
  IF v_e3 IS NOT NULL THEN
    INSERT INTO bayanat.asset_requests
      (request_type_code, title, description_text, priority_code, status_code, raised_by_user_id)
    VALUES
      ('UPDATE_DEFINITION',
       'Column descriptions are outdated after schema migration',
       'The last schema migration added 12 columns without descriptions. Steward needs to review.',
       'MEDIUM', 'OPEN', v_uid)
    RETURNING request_id INTO v_r;
    INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
      SELECT v_r, 'DATA_ENTITIES', entity_id, entity_name_text FROM bayanat.data_entities WHERE entity_id = v_e3;
  END IF;
END $$;
