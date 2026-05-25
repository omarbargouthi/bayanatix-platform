-- Migration 025: Level selections, workflow, configurable lists, translation cache

-- 1. One active maturity level per standard per framework
CREATE TABLE IF NOT EXISTS bayanat.compliance_maturity_selections (
  selection_id  SERIAL PRIMARY KEY,
  framework_id  INTEGER NOT NULL REFERENCES bayanat.gov_compliance_frameworks(framework_id) ON DELETE CASCADE,
  standard_code TEXT NOT NULL,
  selected_level INTEGER NOT NULL CHECK (selected_level BETWEEN 0 AND 5),
  selected_by   TEXT NOT NULL,
  selected_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(framework_id, standard_code)
);

-- 2. Endorsement workflow per evidence item (DRAFT → SUBMITTED → CONFIRMED → ENDORSED)
CREATE TABLE IF NOT EXISTS bayanat.compliance_workflow (
  workflow_id   SERIAL PRIMARY KEY,
  req_id        INTEGER NOT NULL UNIQUE REFERENCES bayanat.gov_compliance_requirements(req_id) ON DELETE CASCADE,
  framework_id  INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SUBMITTED','CONFIRMED','ENDORSED')),
  submitted_by  TEXT,
  submitted_at  TIMESTAMPTZ,
  confirmed_by  TEXT,
  confirmed_at  TIMESTAMPTZ,
  endorsed_by   TEXT,
  endorsed_at   TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Configurable list values (statuses, evidence types, compliance types)
CREATE TABLE IF NOT EXISTS bayanat.compliance_config_items (
  item_id      SERIAL PRIMARY KEY,
  framework_id INTEGER REFERENCES bayanat.gov_compliance_frameworks(framework_id) ON DELETE CASCADE,
  config_group TEXT NOT NULL CHECK (config_group IN ('STATUS','EVIDENCE_TYPE','COMPLIANCE_TYPE')),
  code         TEXT NOT NULL,
  label        TEXT NOT NULL,
  label_ar     TEXT,
  color_hex    TEXT,
  sort_order   INTEGER DEFAULT 0,
  UNIQUE(framework_id, config_group, code)
);

-- Seed default config items for each framework
INSERT INTO bayanat.compliance_config_items
  (framework_id, config_group, code, label, label_ar, color_hex, sort_order)
SELECT f.framework_id, v.cg, v.code, v.label, v.label_ar, v.color_hex, v.sort_order
FROM bayanat.gov_compliance_frameworks f
CROSS JOIN (VALUES
  ('STATUS',          'COMPLETE',                   'Complete',                    'مكتمل',                '#10B981', 1),
  ('STATUS',          'NOT_COMPLETE',               'Not Completed',               'غير مكتمل',            '#F59E0B', 2),
  ('STATUS',          'NA',                         'N/A',                         'لا ينطبق',             '#6B7280', 3),
  ('EVIDENCE_TYPE',   'تقرير',                      'Report',                      'تقرير',                '#6366F1', 1),
  ('EVIDENCE_TYPE',   'وثيقة',                      'Document',                    'وثيقة',                '#3B82F6', 2),
  ('EVIDENCE_TYPE',   'خطة',                        'Plan',                        'خطة',                  '#8B5CF6', 3),
  ('EVIDENCE_TYPE',   'سجل',                        'Record',                      'سجل',                  '#EC4899', 4),
  ('EVIDENCE_TYPE',   'هيكل تنظيمي',                'Organizational Structure',    'هيكل تنظيمي',          '#F59E0B', 5),
  ('EVIDENCE_TYPE',   'إطار عمل',                  'Framework',                   'إطار عمل',             '#10B981', 6),
  ('EVIDENCE_TYPE',   'مؤشر/ تقرير تحسين',          'KPI / Improvement Report',    'مؤشر/ تقرير تحسين',    '#14B8A6', 7),
  ('EVIDENCE_TYPE',   'قرار',                       'Decision',                    'قرار',                 '#EF4444', 8),
  ('EVIDENCE_TYPE',   'قائمة',                      'List',                        'قائمة',                '#64748B', 9),
  ('EVIDENCE_TYPE',   'استراتيجية',                 'Strategy',                    'استراتيجية',           '#A855F7', 10),
  ('EVIDENCE_TYPE',   'وثيقة وخطة تطوير',           'Document & Development Plan', 'وثيقة وخطة تطوير',     '#0EA5E9', 11),
  ('EVIDENCE_TYPE',   'سياسات',                     'Policies',                    'سياسات',               '#84CC16', 12),
  ('COMPLIANCE_TYPE', 'امتثال',                     'Compliance',                  'امتثال',               '#2D4AA0', 1),
  ('COMPLIANCE_TYPE', 'نضج',                        'Maturity',                    'نضج',                  '#5CA85C', 2)
) AS v(cg, code, label, label_ar, color_hex, sort_order)
ON CONFLICT (framework_id, config_group, code) DO NOTHING;

-- 4. Translation cache (Arabic → English)
CREATE TABLE IF NOT EXISTS bayanat.compliance_translations (
  trans_id        SERIAL PRIMARY KEY,
  source_hash     TEXT NOT NULL UNIQUE,
  source_text     TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  target_lang     TEXT NOT NULL DEFAULT 'en',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
