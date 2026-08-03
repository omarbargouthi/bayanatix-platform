-- ── Reports feature — KPI engine (R2 Data Quality, R8 DG Executive Summary) ──
-- KPIs are configurable rows, not hard-coded queries: each kpi_code maps to a
-- function in lib/reports/kpi-registry.ts via metric_key. Snapshots capture a
-- monthly value per KPI per filter scope so reports can render trend lines
-- without re-scanning history on every page load.

CREATE TABLE IF NOT EXISTS bayanat.report_kpi_definitions (
  kpi_code        varchar(40)  PRIMARY KEY,
  report_code     varchar(20)  NOT NULL,
  name_en         varchar(200) NOT NULL,
  name_ar         varchar(200),
  capability_code varchar(20)  NOT NULL,
  metric_key      varchar(60)  NOT NULL,
  target_value    numeric,
  direction       varchar(4)   NOT NULL DEFAULT 'UP' CHECK (direction IN ('UP','DOWN')),
  format          varchar(10)  NOT NULL DEFAULT 'PERCENT' CHECK (format IN ('PERCENT','NUMBER','DAYS')),
  is_active       boolean      NOT NULL DEFAULT true,
  sort_order      int          NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bayanat.report_kpi_snapshots (
  snapshot_id  serial PRIMARY KEY,
  kpi_code     varchar(40) NOT NULL REFERENCES bayanat.report_kpi_definitions(kpi_code) ON DELETE CASCADE,
  scope        jsonb       NOT NULL DEFAULT '{}',
  period_month date        NOT NULL,
  value        numeric,
  captured_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kpi_code, scope, period_month)
);

CREATE INDEX IF NOT EXISTS idx_report_kpi_snapshots_lookup
  ON bayanat.report_kpi_snapshots (kpi_code, period_month);

INSERT INTO bayanat.report_kpi_definitions
  (kpi_code, report_code, name_en, name_ar, capability_code, metric_key, target_value, direction, format, sort_order)
VALUES
  ('DQ_ASSETS_WITH_RULES_PCT',  'R2_DQ',         '% Assets with DQ Rules',        'نسبة الأصول المرتبطة بقواعد جودة',   'DQ', 'dqAssetsWithRulesPct',    80, 'UP',   'PERCENT', 1),
  ('DQ_SCHEDULED_RULES_PCT',    'R2_DQ',         'Rules Executed on Schedule %',  'نسبة القواعد المجدولة',              'DQ', 'dqScheduledRulesPct',     90, 'UP',   'PERCENT', 2),
  ('DQ_PASS_RATE_BY_DIMENSION', 'R2_DQ',         'Pass Rate by Dimension',        'نسبة النجاح حسب البعد',              'DQ', 'dqPassRateByDimension',   95, 'UP',   'PERCENT', 3),
  ('DQ_OPEN_ISSUES',            'R2_DQ',         'Open DQ Issues',                'مشكلات جودة البيانات المفتوحة',      'DQ', 'dqOpenIssuesBySeverity',   0, 'DOWN', 'NUMBER',  4),
  ('DQ_SCORE_BY_DOMAIN',        'R2_DQ',         'DQ Score per Domain',           'درجة جودة البيانات لكل نطاق',        'DQ', 'dqScoreByDomain',         85, 'UP',   'PERCENT', 5),
  ('DG_GOVERNANCE_COVERAGE_PCT','R8_DG_SUMMARY', 'Governance Coverage %',         'نسبة التغطية الحوكمية',              'DG', 'dgGovernanceCoveragePct',90, 'UP',   'PERCENT', 1),
  ('DG_CERTIFICATION_PCT',      'R8_DG_SUMMARY', 'Certification %',               'نسبة الاعتماد',                      'DG', 'dgCertificationPct',      70, 'UP',   'PERCENT', 2),
  ('DG_COMPLETENESS_PCT',       'R8_DG_SUMMARY', 'Overall Completeness %',        'نسبة الاكتمال الكلي',                'DG', 'dgCompletenessPct',       90, 'UP',   'PERCENT', 3),
  ('DG_OPEN_TASKS',             'R8_DG_SUMMARY', 'Open Tasks',                    'المهام المفتوحة',                    'DG', 'dgOpenRequestsByType',     0, 'DOWN', 'NUMBER',  4)
ON CONFLICT (kpi_code) DO NOTHING;

-- ── Business-domain resolution for tables ──────────────────────────────────
-- The spec's "business data domain" (Customer/Finance/HR) isn't governance_domains
-- (that's the NDI capability domain list) — it's the root of the business_glossaries
-- hierarchy (Domain > Subdomain > Term), reached from an asset via asset_business_terms.
-- In the live data, most term links sit on columns (DATA_ATTRIBUTES) rather than
-- tables, so an entity's domain is: its own direct term link if it has one, else the
-- most-recently-linked term among its columns. Entities with no linked term anywhere
-- simply have no row here — consuming queries LEFT JOIN and bucket the rest as "Unassigned".
CREATE OR REPLACE VIEW bayanat.v_entity_business_domain AS
WITH entity_terms AS (
  SELECT abt.asset_id AS entity_id, abt.glossary_id, abt.linked_at
  FROM   bayanat.asset_business_terms abt
  WHERE  abt.asset_type_code = 'DATA_ENTITIES'
  UNION ALL
  SELECT a.entity_id, abt.glossary_id, abt.linked_at
  FROM   bayanat.asset_business_terms abt
  JOIN   bayanat.data_attributes a ON a.attribute_id = abt.asset_id
  WHERE  abt.asset_type_code = 'DATA_ATTRIBUTES'
),
ranked AS (
  SELECT entity_id, glossary_id,
         ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY linked_at DESC NULLS LAST) AS rn
  FROM   entity_terms
)
SELECT
  r.entity_id,
  COALESCE(root2.glossary_id, root1.glossary_id, bg.glossary_id)          AS domain_glossary_id,
  COALESCE(root2.term_name_text, root1.term_name_text, bg.term_name_text) AS domain_name
FROM ranked r
JOIN bayanat.business_glossaries bg ON bg.glossary_id = r.glossary_id
LEFT JOIN bayanat.business_glossaries root1 ON root1.glossary_id = bg.parent_glossary_id
LEFT JOIN bayanat.business_glossaries root2 ON root2.glossary_id = root1.parent_glossary_id
WHERE r.rn = 1;
