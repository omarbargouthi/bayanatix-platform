-- =====================================================
-- Migration 020: Comprehensive Data Quality Enhancement
-- =====================================================

-- Extend dq_rules with template, scheduling, thresholds, and notification config
ALTER TABLE bayanat.dq_rules
  ADD COLUMN IF NOT EXISTS rule_template_code   VARCHAR(40)  NULL,
  ADD COLUMN IF NOT EXISTS rule_config          JSONB        NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS threshold_warn       NUMERIC(5,2) NULL,
  ADD COLUMN IF NOT EXISTS threshold_fail       NUMERIC(5,2) NULL,
  ADD COLUMN IF NOT EXISTS schedule_cron        VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS notify_owners        BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_issue_on_fail   BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_run_at          TIMESTAMP    NULL,
  ADD COLUMN IF NOT EXISTS last_status_code     VARCHAR(20)  NULL,
  ADD COLUMN IF NOT EXISTS last_score           NUMERIC(5,2) NULL;

-- Extend dq_results with pass/fail counts and score
ALTER TABLE bayanat.dq_results
  ADD COLUMN IF NOT EXISTS records_passed_count INT          NULL,
  ADD COLUMN IF NOT EXISTS score                NUMERIC(5,2) NULL,
  ADD COLUMN IF NOT EXISTS run_duration_ms      INT          NULL;

-- Sample values captured per DQ run (valid and invalid values for curation)
CREATE TABLE IF NOT EXISTS bayanat.dq_run_samples (
  sample_id       SERIAL PRIMARY KEY,
  result_id       INT    NOT NULL REFERENCES bayanat.dq_results(result_id) ON DELETE CASCADE,
  sample_value    TEXT   NOT NULL,
  is_valid        BOOLEAN NOT NULL,
  sample_count    INT    NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table-level DQ score rollup
CREATE TABLE IF NOT EXISTS bayanat.dq_entity_scores (
  score_id        SERIAL PRIMARY KEY,
  entity_id       INT    NOT NULL REFERENCES bayanat.data_entities(entity_id) ON DELETE CASCADE,
  overall_score   NUMERIC(5,2) NULL,
  completeness    NUMERIC(5,2) NULL,
  validity        NUMERIC(5,2) NULL,
  uniqueness      NUMERIC(5,2) NULL,
  consistency     NUMERIC(5,2) NULL,
  freshness       NUMERIC(5,2) NULL,
  rule_count      INT    NOT NULL DEFAULT 0,
  pass_count      INT    NOT NULL DEFAULT 0,
  fail_count      INT    NOT NULL DEFAULT 0,
  calculated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_id)
);

-- Column-level DQ score rollup
CREATE TABLE IF NOT EXISTS bayanat.dq_attribute_scores (
  score_id        SERIAL PRIMARY KEY,
  attribute_id    INT    NOT NULL REFERENCES bayanat.data_attributes(attribute_id) ON DELETE CASCADE,
  overall_score   NUMERIC(5,2) NULL,
  rule_count      INT    NOT NULL DEFAULT 0,
  pass_count      INT    NOT NULL DEFAULT 0,
  fail_count      INT    NOT NULL DEFAULT 0,
  calculated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attribute_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_dq_results_rule_id      ON bayanat.dq_results(rule_id);
CREATE INDEX IF NOT EXISTS idx_dq_results_exec_ts      ON bayanat.dq_results(execution_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dq_run_samples_result   ON bayanat.dq_run_samples(result_id);
CREATE INDEX IF NOT EXISTS idx_dq_rules_asset          ON bayanat.dq_rules(asset_type_code, asset_id);
CREATE INDEX IF NOT EXISTS idx_dq_rules_active         ON bayanat.dq_rules(is_active_indicator) WHERE is_active_indicator = true;

-- Seed DQ dimensions if not already present
INSERT INTO bayanat.dq_dimensions (dimension_code, dimension_name_text, description_text) VALUES
  ('COMP',        'Completeness',  'Measures the proportion of data that is present and not null.'),
  ('ACCURACY',    'Accuracy',      'Degree to which data correctly represents the real-world entity.'),
  ('CONSISTENCY', 'Consistency',   'Data values are consistent across datasets and systems.'),
  ('VALIDITY',    'Validity',      'Data conforms to defined formats, types, and allowed values.'),
  ('FRESHNESS',   'Freshness',     'Data is up-to-date and has been refreshed within the expected window.'),
  ('CONFORMITY',  'Conformity',    'Data adheres to internal and external standards and schemas.'),
  ('UNIQUENESS',  'Uniqueness',    'Data contains no duplicate records or values where uniqueness is required.')
ON CONFLICT (dimension_code) DO NOTHING;

-- Seed demo DQ rules for any existing tables
DO $$
DECLARE
  v_entity_id INT;
  v_attr_id   INT;
BEGIN
  -- Try to seed rules for the first entity that exists
  SELECT entity_id INTO v_entity_id FROM bayanat.data_entities LIMIT 1;
  IF v_entity_id IS NOT NULL THEN
    INSERT INTO bayanat.dq_rules (
      rule_name_text, dimension_code, asset_type_code, asset_id,
      rule_logic_type_code, rule_template_code, rule_definition_text,
      severity_level_code, threshold_warn, threshold_fail,
      notify_owners, open_issue_on_fail, is_active_indicator
    ) VALUES
    (
      'Row Count Threshold', 'COMP', 'DATA_ENTITIES', v_entity_id,
      'THRESHOLD', 'ROW_COUNT_THRESHOLD',
      '{"min_rows": 100}',
      'WARNING', 95.0, 80.0,
      true, false, true
    ),
    (
      'Completeness Rate', 'COMP', 'DATA_ENTITIES', v_entity_id,
      'THRESHOLD', 'COMPLETENESS_RATE',
      '{"max_null_pct": 5}',
      'CRITICAL', 95.0, 90.0,
      true, true, true
    )
    ON CONFLICT DO NOTHING;

    -- Seed column-level rule for first attribute
    SELECT attribute_id INTO v_attr_id
    FROM bayanat.data_attributes
    WHERE entity_id = v_entity_id AND is_primary_key_indicator = true
    LIMIT 1;

    IF v_attr_id IS NOT NULL THEN
      INSERT INTO bayanat.dq_rules (
        rule_name_text, dimension_code, asset_type_code, asset_id,
        rule_logic_type_code, rule_template_code, rule_definition_text,
        severity_level_code, threshold_warn, threshold_fail,
        notify_owners, open_issue_on_fail, is_active_indicator
      ) VALUES (
        'Primary Key Not Null', 'COMP', 'DATA_ATTRIBUTES', v_attr_id,
        'TEMPLATE', 'NOT_NULL',
        '{}',
        'CRITICAL', 100.0, 99.0,
        true, true, true
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;
