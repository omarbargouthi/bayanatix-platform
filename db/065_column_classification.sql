-- Column Asset-Type Suggestion Feature (Business vs Technical column classification).
-- See "Bayanatix - Column Asset Type Suggestion Feature Spec.md" for the full design.
-- attribute_class_code (data_attributes) remains the single source of truth for the
-- CONFIRMED type; everything added here tracks the SUGGESTION and its review state,
-- mirroring the pattern already used for table-type suggestions (db/064).

-- ── 2.1 data_attributes: suggestion tracking + FK flag ─────────────────────────

ALTER TABLE bayanat.data_attributes
  ADD COLUMN IF NOT EXISTS is_foreign_key_indicator  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suggested_class_code       varchar(20),
  ADD COLUMN IF NOT EXISTS suggestion_confidence      numeric(4,3),
  ADD COLUMN IF NOT EXISTS suggestion_rationale_json  jsonb,
  ADD COLUMN IF NOT EXISTS suggestion_status_code     varchar(20) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS classified_by_user_id      varchar(100),
  ADD COLUMN IF NOT EXISTS classified_at_timestamp    timestamp;

ALTER TABLE bayanat.data_attributes
  ADD CONSTRAINT data_attributes_suggested_class_check
  CHECK (suggested_class_code IS NULL OR suggested_class_code IN ('BUSINESS','TECHNICAL'));

ALTER TABLE bayanat.data_attributes
  ADD CONSTRAINT data_attributes_suggestion_status_check
  CHECK (suggestion_status_code IN ('NONE','PENDING','ACCEPTED','OVERRIDDEN','STALE'));

-- Any attribute_class_code set before this feature existed was set by a human —
-- treat it as already confirmed rather than something the engine suggested.
UPDATE bayanat.data_attributes
SET suggestion_status_code = 'ACCEPTED'
WHERE attribute_class_code IS NOT NULL AND suggestion_status_code = 'NONE';

-- ── 2.2 attribute_reference_links — FK topology (prerequisite for rules R3/R7) ─

CREATE TABLE IF NOT EXISTS bayanat.attribute_reference_links (
  link_id                  serial PRIMARY KEY,
  fk_attribute_id          int4 NOT NULL REFERENCES bayanat.data_attributes(attribute_id) ON DELETE CASCADE,
  referenced_attribute_id  int4 NOT NULL REFERENCES bayanat.data_attributes(attribute_id) ON DELETE CASCADE,
  constraint_name_text     varchar(200),
  discovery_method_code    varchar(20) NOT NULL,
  confidence_number        numeric(4,3) DEFAULT 1.0,
  discovered_at_timestamp  timestamp DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ref_link UNIQUE (fk_attribute_id, referenced_attribute_id),
  CONSTRAINT attribute_reference_links_discovery_method_check
    CHECK (discovery_method_code IN ('INTROSPECTED','NAME_INFERRED','MANUAL'))
);

CREATE INDEX IF NOT EXISTS idx_ref_links_fk_attr ON bayanat.attribute_reference_links(fk_attribute_id);
CREATE INDEX IF NOT EXISTS idx_ref_links_referenced_attr ON bayanat.attribute_reference_links(referenced_attribute_id);

-- ── 2.3 classification_patterns — admin-editable name-pattern dictionaries ─────

CREATE TABLE IF NOT EXISTS bayanat.classification_patterns (
  pattern_id          serial PRIMARY KEY,
  pattern_group_code  varchar(30) NOT NULL,
  pattern_regex_text  varchar(200) NOT NULL,
  data_source_id      int4 NULL REFERENCES bayanat.data_sources(data_source_id) ON DELETE CASCADE,
  is_enabled_indicator boolean NOT NULL DEFAULT true,
  notes_text          text,
  created_at_timestamp timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT classification_patterns_group_check
    CHECK (pattern_group_code IN ('SURROGATE_KEY','AUDIT_COLUMN','NATURAL_ID','LOOKUP_VALUE','EXCLUDE'))
);

CREATE INDEX IF NOT EXISTS idx_class_patterns_group ON bayanat.classification_patterns(pattern_group_code) WHERE is_enabled_indicator;

-- Seed global (data_source_id IS NULL) pattern dictionaries, applied to lower(physical_name_text).
INSERT INTO bayanat.classification_patterns (pattern_group_code, pattern_regex_text, data_source_id, notes_text)
SELECT * FROM (VALUES
  ('SURROGATE_KEY', '_id$',    NULL::int4, 'Trailing _id — surrogate key convention'),
  ('SURROGATE_KEY', '^id$',    NULL::int4, 'Bare id column'),
  ('SURROGATE_KEY', '_key$',   NULL::int4, NULL),
  ('SURROGATE_KEY', '_sk$',    NULL::int4, 'Surrogate key abbreviation'),
  ('SURROGATE_KEY', '_seq$',   NULL::int4, NULL),
  ('SURROGATE_KEY', '_uid$',   NULL::int4, NULL),
  ('SURROGATE_KEY', 'guid',    NULL::int4, NULL),
  ('SURROGATE_KEY', 'uuid',    NULL::int4, NULL),

  ('AUDIT_COLUMN', '^created_',   NULL::int4, NULL),
  ('AUDIT_COLUMN', '^updated_',   NULL::int4, NULL),
  ('AUDIT_COLUMN', '^modified_',  NULL::int4, NULL),
  ('AUDIT_COLUMN', '_timestamp$', NULL::int4, NULL),
  ('AUDIT_COLUMN', '^row_version',NULL::int4, NULL),
  ('AUDIT_COLUMN', '^is_deleted', NULL::int4, NULL),
  ('AUDIT_COLUMN', '^deleted_',   NULL::int4, NULL),
  ('AUDIT_COLUMN', '^etl_',       NULL::int4, NULL),
  ('AUDIT_COLUMN', '^batch_',     NULL::int4, NULL),
  ('AUDIT_COLUMN', '^load_',      NULL::int4, NULL),
  ('AUDIT_COLUMN', '^src_sys',    NULL::int4, NULL),
  ('AUDIT_COLUMN', '^tenant_id$', NULL::int4, NULL),
  ('AUDIT_COLUMN', '^hash_',      NULL::int4, NULL),
  ('AUDIT_COLUMN', '^rec_status', NULL::int4, NULL),

  ('NATURAL_ID', '_no$',     NULL::int4, NULL),
  ('NATURAL_ID', '_num$',    NULL::int4, NULL),
  ('NATURAL_ID', '_number$', NULL::int4, NULL),
  ('NATURAL_ID', '_code$',   NULL::int4, NULL),
  ('NATURAL_ID', '_ref$',    NULL::int4, NULL),
  ('NATURAL_ID', 'iban',     NULL::int4, NULL),
  ('NATURAL_ID', 'vat_no',   NULL::int4, NULL),
  ('NATURAL_ID', 'national_id', NULL::int4, NULL),

  ('LOOKUP_VALUE', '_name$',        NULL::int4, NULL),
  ('LOOKUP_VALUE', '_desc$',        NULL::int4, NULL),
  ('LOOKUP_VALUE', '_description$', NULL::int4, NULL),
  ('LOOKUP_VALUE', '_label$',       NULL::int4, NULL),
  ('LOOKUP_VALUE', '_value$',       NULL::int4, NULL),
  ('LOOKUP_VALUE', '_text$',        NULL::int4, NULL),
  ('LOOKUP_VALUE', 'name_(en|ar)$', NULL::int4, NULL)
) AS seed(pattern_group_code, pattern_regex_text, data_source_id, notes_text)
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.classification_patterns cp
  WHERE cp.pattern_group_code = seed.pattern_group_code
    AND cp.pattern_regex_text = seed.pattern_regex_text
    AND cp.data_source_id IS NULL
);

-- ── 2.4 connection_registry — crawler-integrated classification settings ──────

ALTER TABLE bayanat.connection_registry
  ADD COLUMN IF NOT EXISTS crawler_settings_json jsonb NOT NULL DEFAULT '{
    "auto_classify_columns": true,
    "classify_scope": "NEW_ONLY",
    "harvest_fk_constraints": true,
    "infer_fk_by_naming": true,
    "auto_accept_band": "NONE"
  }'::jsonb;

-- ── 2.5 classification_runs — job log ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.classification_runs (
  run_id                      serial PRIMARY KEY,
  scope_type_code             varchar(20) NOT NULL,
  scope_id                    int4,
  triggered_by_user_id        varchar(100),
  status_code                 varchar(20) NOT NULL DEFAULT 'RUNNING',
  started_at                  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at                 timestamp,
  attributes_evaluated_count  int4 DEFAULT 0,
  suggestions_changed_count   int4 DEFAULT 0,
  summary_json                jsonb,
  CONSTRAINT classification_runs_scope_type_check
    CHECK (scope_type_code IN ('DATA_SOURCE','SCHEMA','ENTITY','FULL')),
  CONSTRAINT classification_runs_status_check
    CHECK (status_code IN ('RUNNING','COMPLETED','FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_classification_runs_scope ON bayanat.classification_runs(scope_type_code, scope_id);
