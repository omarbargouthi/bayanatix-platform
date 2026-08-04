-- ── Reports feature, part 2 — remaining capability reports, KPI admin,
--    custom-SQL KPI sandbox, export audit, steward domain-scoping seed ──

-- A KPI is now driven by exactly one of metric_key (built-in registry function) or
-- custom_sql (admin-authored, executed through the read-only sandbox role below).
ALTER TABLE bayanat.report_kpi_definitions ADD COLUMN IF NOT EXISTS custom_sql text;
ALTER TABLE bayanat.report_kpi_definitions ALTER COLUMN metric_key DROP NOT NULL;
ALTER TABLE bayanat.report_kpi_definitions ADD COLUMN IF NOT EXISTS created_by_user_id varchar(64);

-- ── Export audit trail (§6) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.report_export_audit (
  audit_id           serial PRIMARY KEY,
  report_code        varchar(20) NOT NULL,
  exported_by_user_id varchar(64) NOT NULL,
  filters            jsonb NOT NULL DEFAULT '{}',
  format             varchar(10) NOT NULL,
  exported_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_export_audit_time ON bayanat.report_export_audit (exported_at DESC);

-- ── Read-only sandbox role for admin-authored custom KPIs (FR-3) ───────────
-- This role — not the SQL-text validation in lib/reports/kpi-sandbox.ts — is the
-- real security boundary: it can SELECT from bayanat.* and nothing else, so even a
-- custom KPI query that slips past text validation cannot write, alter, or drop.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bayanatix_kpi_readonly') THEN
    CREATE ROLE bayanatix_kpi_readonly LOGIN PASSWORD 'kpi_sandbox_readonly_pw';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA bayanat TO bayanatix_kpi_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA bayanat TO bayanatix_kpi_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA bayanat GRANT SELECT ON TABLES TO bayanatix_kpi_readonly;
ALTER ROLE bayanatix_kpi_readonly SET statement_timeout = '3s';
REVOKE CREATE ON SCHEMA bayanat FROM bayanatix_kpi_readonly;

-- Extra hardening: KPIs never need password hashes or LLM API credentials, so pull
-- those out of the otherwise-blanket SELECT grant even though only ADMINs can author
-- custom KPIs in the first place. Note: a column-level REVOKE does NOT narrow an
-- existing table-wide GRANT SELECT in Postgres (the table-wide grant still covers
-- every column) — the only way to actually close this off is to revoke the whole
-- table and, if a custom KPI ever needs it, grant back a column allowlist instead.
REVOKE SELECT ON bayanat.users FROM bayanatix_kpi_readonly;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='bayanat' AND table_name='llm_credentials') THEN
    EXECUTE 'REVOKE SELECT ON bayanat.llm_credentials FROM bayanatix_kpi_readonly';
  END IF;
END
$$;

-- ── New capability report KPIs (R1, R3, R4, R5, R6, R7, R9) ────────────────
INSERT INTO bayanat.report_kpi_definitions
  (kpi_code, report_code, name_en, name_ar, capability_code, metric_key, target_value, direction, format, sort_order)
VALUES
  -- R1 — Data Catalog / Metadata (MCM)
  ('MCM_TABLES_CATALOGED',      'R1_MCM', 'Tables Cataloged',              'الجداول الموثقة',              'MCM', 'mcmTablesCataloged',      NULL, 'UP', 'NUMBER',  1),
  ('MCM_TABLES_WITH_OWNER_PCT', 'R1_MCM', '% Tables with Owner',           'نسبة الجداول ذات مالك',          'MCM', 'mcmTablesWithOwnerPct',   90,   'UP', 'PERCENT', 2),
  ('MCM_BUSINESS_DESC_PCT',     'R1_MCM', '% BUSINESS Columns Described',  'نسبة الأعمدة الوصفية الموثقة',   'MCM', 'mcmBusinessDescPct',      90,   'UP', 'PERCENT', 3),
  ('MCM_TERM_LINK_PCT',         'R1_MCM', '% Columns Linked to a Term',    'نسبة الأعمدة المرتبطة بمصطلح',   'MCM', 'mcmTermLinkPct',          50,   'UP', 'PERCENT', 4),
  ('MCM_COMPLETENESS_SCORE',    'R1_MCM', 'Metadata Completeness Score',   'درجة اكتمال البيانات الوصفية',   'MCM', 'mcmCompletenessScore',    80,   'UP', 'PERCENT', 5),

  -- R3 — Data Classification (DC)
  ('DC_CLASSIFIED_PCT',          'R3_DC', '% Columns Classified',          'نسبة الأعمدة المصنفة',           'DC', 'dcClassifiedPct',          90, 'UP',   'PERCENT', 1),
  ('DC_LEVEL_DISTRIBUTION',      'R3_DC', 'Classification Level Distribution', 'توزيع مستويات التصنيف',       'DC', 'dcLevelDistribution',      NULL, 'UP', 'NUMBER',  2),
  ('DC_PI_REVIEWED_PCT',         'R3_DC', '% PI Columns Reviewed',         'نسبة أعمدة البيانات الشخصية المراجعة', 'DC', 'dcPiReviewedPct',    100, 'UP',   'PERCENT', 3),
  ('DC_UNCLASSIFIED_BACKLOG',    'R3_DC', 'Unclassified Backlog',          'المتراكم غير المصنف',            'DC', 'dcUnclassifiedBacklogCount', 0, 'DOWN', 'NUMBER',  4),

  -- R4 — Data Sharing (DSI)
  ('DSI_DSA_STATUS',            'R4_DSI', 'Active DSAs',                   'اتفاقيات المشاركة النشطة',       'DSI', 'dsiDsaStatus',            NULL, 'UP',   'NUMBER',  1),
  ('DSI_RESPONSE_SLA_PCT',      'R4_DSI', 'Response SLA %',                'نسبة الالتزام بمدة الاستجابة',   'DSI', 'dsiResponseSlaPct',       90,   'UP',   'PERCENT', 2),
  ('DSI_BY_SCOPE',              'R4_DSI', 'Agreements by Scope',           'الاتفاقيات حسب النطاق',          'DSI', 'dsiByScope',              NULL, 'UP',   'NUMBER',  3),
  ('DSI_EXPIRING_SOON',         'R4_DSI', 'Expiring ≤ 90 Days',            'تنتهي خلال 90 يوماً',            'DSI', 'dsiExpiringSoon',         0,    'DOWN', 'NUMBER',  4),
  ('DSI_SHARING_ELIGIBLE_PCT',  'R4_DSI', '% Sharing-Eligible',            'نسبة الأصول القابلة للمشاركة',   'DSI', 'dsiSharingEligiblePct',   70,   'UP',   'PERCENT', 5),

  -- R5 — Open Data (OD)
  ('OD_STATUS_BREAKDOWN',   'R5_OD', 'Datasets Published',            'مجموعات البيانات المنشورة',      'OD', 'odStatusBreakdown',   NULL, 'UP', 'NUMBER',  1),
  ('OD_PUBLICATION_SLA_PCT','R5_OD', 'Publication SLA %',             'نسبة الالتزام بمدة النشر',        'OD', 'odPublicationSlaPct', 80,   'UP', 'PERCENT', 2),
  ('OD_DQ_DISCLOSURE_PCT',  'R5_OD', '% Published with DQ Disclosure','نسبة المنشور مع إفصاح الجودة',   'OD', 'odDqDisclosurePct',   100,  'UP', 'PERCENT', 3),

  -- R6 — FOI
  ('FOI_STATUS_BREAKDOWN',     'R6_FOI', 'Requests by Status',         'الطلبات حسب الحالة',             'FOI', 'foiStatusBreakdown',     NULL, 'UP',   'NUMBER',  1),
  ('FOI_ON_TIME_PCT',          'R6_FOI', 'On-Time First Response %',   'نسبة الاستجابة في الوقت المحدد',  'FOI', 'foiOnTimePct',           90,   'UP',   'PERCENT', 2),
  ('FOI_AVG_FULFILLMENT_DAYS', 'R6_FOI', 'Avg Fulfillment Days',       'متوسط أيام الإنجاز',              'FOI', 'foiAvgFulfillmentDays',  15,   'DOWN', 'DAYS',    3),
  ('FOI_REJECTION_RATE_PCT',   'R6_FOI', 'Rejection Rate %',           'نسبة الرفض',                     'FOI', 'foiRejectionRatePct',    10,   'DOWN', 'PERCENT', 4),
  ('FOI_APPEAL_OVERTURN_PCT',  'R6_FOI', 'Appeal Overturn %',          'نسبة قبول التظلمات',              'FOI', 'foiAppealOverturnPct',   20,   'DOWN', 'PERCENT', 5),
  ('FOI_REVENUE_COLLECTED',    'R6_FOI', 'Revenue Collected',          'الإيرادات المحصلة',               'FOI', 'foiRevenueCollected',    NULL, 'UP',   'NUMBER',  6),

  -- R7 — Personal Data Protection (PDP)
  ('PDP_PI_COLUMN_COUNT',          'R7_PDP', 'PI Columns',                    'أعمدة البيانات الشخصية',         'PDP', 'pdpPiColumnCount',         NULL, 'UP', 'NUMBER',  1),
  ('PDP_PI_CLASSIFIED_OWNED_PCT',  'R7_PDP', '% PI Classified & Owned',       'نسبة تصنيف وملكية البيانات الشخصية', 'PDP', 'pdpPiClassifiedOwnedPct', 90, 'UP', 'PERCENT', 2),
  ('PDP_PI_IN_ACTIVE_DSA',         'R7_PDP', 'PI in Active DSAs',             'بيانات شخصية ضمن اتفاقيات نشطة', 'PDP', 'pdpPiInActiveDsa',        NULL, 'UP', 'NUMBER',  3),

  -- R9 — Retention
  ('RET_CATEGORIES_WITH_SCHEDULES_PCT', 'R9_RETENTION', '% Categories with Schedule', 'نسبة الفئات ذات جدول احتفاظ', 'RET', 'retCategoriesWithSchedulesPct', 100, 'UP',   'PERCENT', 1),
  ('RET_ASSETS_PAST_RETENTION',         'R9_RETENTION', 'Assets Past Retention',      'أصول تجاوزت مدة الاحتفاظ',    'RET', 'retAssetsPastRetention',        0,   'DOWN', 'NUMBER',  2),
  ('RET_LEGAL_HOLDS_ACTIVE',            'R9_RETENTION', 'Active Legal Holds',         'الحجوزات القانونية النشطة',   'RET', 'retLegalHoldsActive',           NULL,'UP',   'NUMBER',  3),
  ('RET_PURGE_QUEUE',                   'R9_RETENTION', 'Purge Queue',                'قائمة انتظار الإتلاف',        'RET', 'retPurgeQueue',                 0,   'DOWN', 'NUMBER',  4)
ON CONFLICT (kpi_code) DO NOTHING;

-- ── Seed steward domain assignments so AC-7 scoping is demoable ────────────
INSERT INTO bayanat.glossary_stewards (glossary_id, user_id, assigned_by)
SELECT 1, 'khaled.almansour', 'sara.alqahtani'
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.glossary_stewards WHERE glossary_id = 1 AND user_id = 'khaled.almansour'
);
INSERT INTO bayanat.glossary_stewards (glossary_id, user_id, assigned_by)
SELECT 3, 'fahad.harbi', 'sara.alqahtani'
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.glossary_stewards WHERE glossary_id = 3 AND user_id = 'fahad.harbi'
);
