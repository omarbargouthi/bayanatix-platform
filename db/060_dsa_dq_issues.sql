-- Migration 060: DQ issue notes for Data Sharing Agreement columns
-- =====================================================================
-- Mirrors bayanat.open_dataset_dq_issues so DSA attributes can carry the
-- same kind of reviewer DQ notes Open Data columns already support, in
-- addition to the live dq_rules results shown on each attribute.

CREATE TABLE IF NOT EXISTS bayanat.dsa_dataset_dq_issues (
  issue_id           SERIAL PRIMARY KEY,
  dsa_id             INT NOT NULL REFERENCES bayanat.data_sharing_agreements(dsa_id) ON DELETE CASCADE,
  attribute_id       INT NOT NULL REFERENCES bayanat.data_attributes(attribute_id),
  dimension_code     VARCHAR(20) REFERENCES bayanat.dq_dimensions(dimension_code),
  issue_text         TEXT NOT NULL,
  severity_code      VARCHAR(20) NOT NULL DEFAULT 'WARNING'
    CHECK (severity_code IN ('BLOCKER','WARNING','INFO')),
  created_by_user_id VARCHAR(64) REFERENCES bayanat.users(user_id),
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dsa_dq_issues_dsa ON bayanat.dsa_dataset_dq_issues(dsa_id);
CREATE INDEX IF NOT EXISTS idx_dsa_dq_issues_attr ON bayanat.dsa_dataset_dq_issues(attribute_id);
