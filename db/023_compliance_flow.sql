-- Add standard grouping columns to requirements
ALTER TABLE bayanat.gov_compliance_requirements
  ADD COLUMN IF NOT EXISTS standard      TEXT,
  ADD COLUMN IF NOT EXISTS standard_code TEXT;

-- Level configuration per framework
CREATE TABLE IF NOT EXISTS bayanat.gov_compliance_level_config (
  config_id    SERIAL PRIMARY KEY,
  framework_id INT  NOT NULL
    REFERENCES bayanat.gov_compliance_frameworks(framework_id) ON DELETE CASCADE,
  level_num    INT  NOT NULL CHECK (level_num BETWEEN 0 AND 5),
  name         TEXT NOT NULL,
  color_hex    TEXT NOT NULL DEFAULT '#888888',
  description  TEXT,
  UNIQUE (framework_id, level_num)
);

-- Seed default level configs for every existing framework
INSERT INTO bayanat.gov_compliance_level_config
  (framework_id, level_num, name, color_hex, description)
SELECT f.framework_id, l.level_num, l.name, l.color_hex, l.description
FROM bayanat.gov_compliance_frameworks f
CROSS JOIN (VALUES
  (0, 'No Capability', '#D84848',
   'No defined data management practices. Activities are ad-hoc and undefined.'),
  (1, 'Build',         '#E88030',
   'Initial data management practices being established with basic awareness.'),
  (2, 'Definition',    '#2D4AA0',
   'Practices formally defined, documented and communicated across the organisation.'),
  (3, 'Activation',    '#3D7EC8',
   'Defined practices actively implemented and embedded across all relevant teams.'),
  (4, 'Managed',       '#1E8C76',
   'Practices measured and controlled using KPIs and performance dashboards.'),
  (5, 'Innovation',    '#5CA85C',
   'Continuous improvement and innovation — data management is a strategic differentiator.')
) AS l(level_num, name, color_hex, description)
ON CONFLICT (framework_id, level_num) DO NOTHING;
