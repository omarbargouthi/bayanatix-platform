-- =====================================================================
-- Migration 054: FOI structured attributes, source mapping, payment exemption
-- =====================================================================

-- ── Structured attributes requested by requester ──────────────────────
CREATE TABLE IF NOT EXISTS bayanat.foi_requested_attributes (
  req_attr_id           SERIAL4       PRIMARY KEY,
  foi_request_id        INT           NOT NULL REFERENCES bayanat.foi_requests(foi_request_id) ON DELETE CASCADE,
  attribute_name_text   VARCHAR(200)  NOT NULL,
  description_text      TEXT,
  format_hint_text      VARCHAR(100),
  sort_order            INT4          NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Officer source mapping: maps each requested attribute to catalog or manual source ──
CREATE TABLE IF NOT EXISTS bayanat.foi_attribute_mappings (
  mapping_id              SERIAL4       PRIMARY KEY,
  foi_request_id          INT           NOT NULL REFERENCES bayanat.foi_requests(foi_request_id) ON DELETE CASCADE,
  req_attr_id             INT           NOT NULL REFERENCES bayanat.foi_requested_attributes(req_attr_id) ON DELETE CASCADE,
  source_type             VARCHAR(20)   NOT NULL CHECK (source_type IN ('CATALOG','MANUAL')),
  -- CATALOG path
  data_source_id          INT           REFERENCES bayanat.data_sources(data_source_id),
  data_entity_id          INT           REFERENCES bayanat.data_entities(entity_id),
  data_attribute_id       INT           REFERENCES bayanat.data_attributes(attribute_id),
  -- MANUAL path
  manual_system_name      VARCHAR(200),
  manual_entity_name      VARCHAR(200),
  manual_column_name      VARCHAR(200),
  -- Sensitivity (officer assigns)
  sensitivity_code        VARCHAR(20)   REFERENCES bayanat.classification_types(class_code),
  classification_status   VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
    CHECK (classification_status IN ('PENDING','CLEARED','BLOCKED')),
  classification_notes    TEXT,
  -- Quality check
  quality_status          VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
    CHECK (quality_status IN ('PENDING','CLEARED','FLAGGED')),
  quality_notes           TEXT,
  officer_notes           TEXT,
  mapped_by_user_id       VARCHAR(64)   REFERENCES bayanat.users(user_id),
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Link foi_requests to resulting open dataset ──────────────────────
ALTER TABLE bayanat.foi_requests
  ADD COLUMN IF NOT EXISTS linked_open_dataset_id INT REFERENCES bayanat.open_datasets(dataset_id);

-- ── Payment exemption fields on foi_assessments ───────────────────────
ALTER TABLE bayanat.foi_assessments
  ADD COLUMN IF NOT EXISTS payment_exempt           BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exemption_reason         TEXT,
  ADD COLUMN IF NOT EXISTS exemption_evidence_ref   VARCHAR(500),
  ADD COLUMN IF NOT EXISTS exemption_approved       BOOLEAN;     -- NULL=pending, TRUE=approved, FALSE=rejected

-- ── Update fulfillment_stage_code constraint to new stages ─────────────
DO $$
DECLARE con_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO con_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.check_constraints cc
    ON cc.constraint_name = tc.constraint_name
   AND cc.constraint_schema = tc.constraint_schema
  WHERE tc.table_schema = 'bayanat'
    AND tc.table_name = 'foi_requests'
    AND cc.check_clause LIKE '%fulfillment_stage_code%';
  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE bayanat.foi_requests DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

-- Migrate existing rows to new stage names
UPDATE bayanat.foi_requests SET fulfillment_stage_code = 'SOURCE_MAPPING'
  WHERE fulfillment_stage_code IN ('OWNER_SCOPE_REVIEW','STEWARD_COORDINATION');
UPDATE bayanat.foi_requests SET fulfillment_stage_code = 'DELIVERY'
  WHERE fulfillment_stage_code = 'PAYMENT_CONFIRMATION';

ALTER TABLE bayanat.foi_requests
  ADD CONSTRAINT foi_requests_fulfillment_stage_code_check
  CHECK (fulfillment_stage_code IN (
    'OWNER_IDENTIFICATION',
    'SOURCE_MAPPING',
    'CLASSIFICATION_GATE',
    'QUALITY_GATE',
    'TECHNICAL_COMPILATION',
    'OWNER_PACKAGE_APPROVAL',
    'DMO_RELEASE_APPROVAL',
    'DELIVERY'
  ));

-- ── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_foi_req_attrs_request ON bayanat.foi_requested_attributes(foi_request_id);
CREATE INDEX IF NOT EXISTS idx_foi_mappings_request  ON bayanat.foi_attribute_mappings(foi_request_id);
CREATE INDEX IF NOT EXISTS idx_foi_mappings_req_attr ON bayanat.foi_attribute_mappings(req_attr_id);
