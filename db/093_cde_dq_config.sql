-- CDE Data Quality composite scoring config (Data Catalog page "Data Quality" gauge).
-- Lets an admin adjust which dq_dimensions feed the CDE composite score and how they're weighted,
-- without a code change. Weights are re-normalized at read time over dimensions that both have
-- rule coverage and are enabled, so leaving a dimension with no rules yet doesn't zero out the score.
CREATE TABLE IF NOT EXISTS bayanat.dq_cde_dimension_config (
  dimension_code       VARCHAR(20) PRIMARY KEY REFERENCES bayanat.dq_dimensions(dimension_code),
  display_label_text   VARCHAR(100) NOT NULL,
  weight                NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_enabled            BOOLEAN NOT NULL DEFAULT true,
  updated_by_user_id    VARCHAR(255) REFERENCES bayanat.users(user_id) ON DELETE SET NULL,
  updated_at_timestamp  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FRESHNESS is labeled "Timeliness" here to match the business-facing DQ vocabulary
-- requested for this card, without renaming the shared dq_dimensions.FRESHNESS code used elsewhere.
INSERT INTO bayanat.dq_cde_dimension_config (dimension_code, display_label_text, weight, is_enabled) VALUES
  ('ACCURACY',    'Accuracy',     16.67, true),
  ('COMP',        'Completeness', 16.67, true),
  ('FRESHNESS',   'Timeliness',   16.67, true),
  ('CONSISTENCY', 'Consistency',  16.67, true),
  ('VALIDITY',    'Validity',     16.67, true),
  ('UNIQUENESS',  'Uniqueness',   16.65, true)
ON CONFLICT (dimension_code) DO NOTHING;
