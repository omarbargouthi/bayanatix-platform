import { sql } from "../db";
import { KPI_REGISTRY, type ReportFilters, type KpiResult } from "../reports/kpi-registry";

export type { ReportFilters, KpiResult };

// ── Filter dimension lookups ────────────────────────────────────────────────

export type BusinessDomain = { glossaryId: number; name: string };

export async function getBusinessDomains(): Promise<BusinessDomain[]> {
  return sql<BusinessDomain[]>`
    SELECT glossary_id AS "glossaryId", term_name_text AS "name"
    FROM   bayanat.business_glossaries
    WHERE  parent_glossary_id IS NULL
    ORDER BY term_name_text
  `;
}

export type SourceLite = { dataSourceId: number; sourceName: string };

export async function getDataSourcesLite(): Promise<SourceLite[]> {
  return sql<SourceLite[]>`
    SELECT data_source_id AS "dataSourceId", source_name_text AS "sourceName"
    FROM   bayanat.data_sources
    ORDER BY source_name_text
  `;
}

export type UserLite = { userId: string; fullName: string };

export async function getUsersLite(): Promise<UserLite[]> {
  return sql<UserLite[]>`
    SELECT user_id AS "userId", full_name AS "fullName"
    FROM   bayanat.users
    WHERE  is_active = true
    ORDER BY full_name
  `;
}

// ── KPI definitions ──────────────────────────────────────────────────────────

export type KpiDefinition = {
  kpiCode: string;
  reportCode: string;
  nameEn: string;
  nameAr: string | null;
  capabilityCode: string;
  metricKey: string;
  targetValue: number | null;
  direction: "UP" | "DOWN";
  format: "PERCENT" | "NUMBER" | "DAYS";
  sortOrder: number;
};

export async function getKpiDefinitions(reportCode: string): Promise<KpiDefinition[]> {
  const rows = await sql<any[]>`
    SELECT kpi_code AS "kpiCode", report_code AS "reportCode", name_en AS "nameEn", name_ar AS "nameAr",
           capability_code AS "capabilityCode", metric_key AS "metricKey",
           target_value AS "targetValue", direction, format, sort_order AS "sortOrder"
    FROM   bayanat.report_kpi_definitions
    WHERE  report_code = ${reportCode} AND is_active = true
    ORDER BY sort_order
  `;
  return rows.map((r) => ({ ...r, targetValue: r.targetValue != null ? Number(r.targetValue) : null }));
}

export type KpiCardData = KpiDefinition & KpiResult;

export async function getReportKpiCards(reportCode: string, filters: ReportFilters): Promise<KpiCardData[]> {
  const defs = await getKpiDefinitions(reportCode);
  return Promise.all(
    defs.map(async (d) => {
      const fn = KPI_REGISTRY[d.metricKey];
      const result: KpiResult = fn ? await fn(filters) : { value: 0, breakdown: [] };
      return { ...d, ...result };
    }),
  );
}

// ── Snapshots (trend history) ───────────────────────────────────────────────

export type TrendPoint = { periodMonth: string; value: number };

// This pass only captures the global (unfiltered) scope — enough to drive the
// default trend view. Per-filter-combination snapshot fan-out and the cron/backfill
// automation (FR-4) are a documented follow-up.
const GLOBAL_SCOPE = {} as Record<string, never>;

export async function getKpiSnapshotTrend(kpiCode: string, months = 12): Promise<TrendPoint[]> {
  const rows = await sql<{ periodMonth: string; value: number | null }[]>`
    SELECT period_month::text AS "periodMonth", value::numeric AS value
    FROM   bayanat.report_kpi_snapshots
    WHERE  kpi_code = ${kpiCode} AND scope = ${GLOBAL_SCOPE as any}::jsonb
    ORDER BY period_month DESC
    LIMIT ${months}
  `;
  return rows.reverse().map((r) => ({ periodMonth: r.periodMonth, value: r.value != null ? Number(r.value) : 0 }));
}

export async function captureSnapshot(reportCode: string): Promise<{ captured: number }> {
  const defs = await getKpiDefinitions(reportCode);
  const periodMonth = new Date();
  periodMonth.setUTCDate(1);
  const periodMonthStr = periodMonth.toISOString().slice(0, 10);

  let captured = 0;
  for (const d of defs) {
    const fn = KPI_REGISTRY[d.metricKey];
    if (!fn) continue;
    const result = await fn({});
    await sql`
      INSERT INTO bayanat.report_kpi_snapshots (kpi_code, scope, period_month, value)
      VALUES (${d.kpiCode}, ${GLOBAL_SCOPE as any}::jsonb, ${periodMonthStr}, ${result.value})
      ON CONFLICT (kpi_code, scope, period_month) DO UPDATE SET value = EXCLUDED.value, captured_at = now()
    `;
    captured++;
  }
  return { captured };
}

// ── R2 — Data Quality report ─────────────────────────────────────────────────

export type DqDrillDownRow = {
  resultId: number;
  ruleId: number;
  ruleName: string;
  dimensionName: string;
  severity: string;
  statusCode: string;
  score: number | null;
  executedAt: string;
  ageDays: number;
  entityId: number;
  entityName: string;
  schemaId: number;
  sourceName: string;
  domainName: string;
};

export type Page = { limit: number; offset: number };

async function getDqDrillDown(f: ReportFilters, page: Page): Promise<{ rows: DqDrillDownRow[]; total: number }> {
  const rows = await sql<any[]>`
    WITH scoped_rules AS (
      SELECT
        r.rule_id, r.dimension_code, r.severity_level_code,
        COALESCE(e.entity_id, ep.entity_id) AS entity_id,
        COALESCE(e.schema_id, ep.schema_id) AS schema_id
      FROM bayanat.dq_rules r
      LEFT JOIN bayanat.data_entities   e  ON r.asset_type_code = 'DATA_ENTITIES'   AND e.entity_id    = r.asset_id
      LEFT JOIN bayanat.data_attributes a  ON r.asset_type_code = 'DATA_ATTRIBUTES' AND a.attribute_id = r.asset_id
      LEFT JOIN bayanat.data_entities   ep ON r.asset_type_code = 'DATA_ATTRIBUTES' AND ep.entity_id   = a.entity_id
    )
    SELECT
      res.result_id                                    AS "resultId",
      sr.rule_id                                        AS "ruleId",
      r.rule_name_text                                  AS "ruleName",
      COALESCE(dd.dimension_name_text, 'Unclassified')  AS "dimensionName",
      COALESCE(sr.severity_level_code, 'UNSPECIFIED')   AS severity,
      res.status_code                                   AS "statusCode",
      res.score::numeric                                AS score,
      res.execution_timestamp                           AS "executedAt",
      EXTRACT(DAY FROM NOW() - res.execution_timestamp)::int AS "ageDays",
      e.entity_id                                       AS "entityId",
      e.entity_name_text                                AS "entityName",
      e.schema_id                                       AS "schemaId",
      ds.source_name_text                                AS "sourceName",
      COALESCE(dom.domain_name, 'Unassigned')           AS "domainName",
      count(*) OVER ()::int                             AS "totalCount"
    FROM bayanat.dq_results res
    JOIN scoped_rules sr ON sr.rule_id = res.rule_id
    JOIN bayanat.dq_rules r ON r.rule_id = sr.rule_id
    LEFT JOIN bayanat.dq_dimensions dd ON dd.dimension_code = sr.dimension_code
    JOIN bayanat.data_entities e  ON e.entity_id = sr.entity_id
    JOIN bayanat.data_schemas s   ON s.schema_id = sr.schema_id
    JOIN bayanat.data_sources ds  ON ds.data_source_id = s.data_source_id
    LEFT JOIN bayanat.v_entity_business_domain dom ON dom.entity_id = sr.entity_id
    WHERE res.status_code IN ('FAILED', 'ERROR')
      AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
      AND (${f.domainGlossaryId ?? null}::int IS NULL OR dom.domain_glossary_id = ${f.domainGlossaryId ?? null})
    ORDER BY res.execution_timestamp DESC
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  const total = rows[0]?.totalCount ?? 0;
  return {
    total,
    rows: rows.map((r) => ({ ...r, score: r.score != null ? Number(r.score) : null, totalCount: undefined })),
  };
}

export type DqReportData = {
  kpis: KpiCardData[];
  trend: TrendPoint[];
  primaryKpiCode: string | null;
  drillDown: DqDrillDownRow[];
  total: number;
};

export async function getDqReportData(filters: ReportFilters, page: Page = { limit: 25, offset: 0 }): Promise<DqReportData> {
  const kpis = await getReportKpiCards("R2_DQ", filters);
  const primaryKpiCode = kpis[0]?.kpiCode ?? null;
  const [{ rows: drillDown, total }, trend] = await Promise.all([
    getDqDrillDown(filters, page),
    primaryKpiCode ? getKpiSnapshotTrend(primaryKpiCode) : Promise.resolve([]),
  ]);
  return { kpis, trend, primaryKpiCode, drillDown, total };
}

// ── R8 — DG Executive Summary report ────────────────────────────────────────

export type DgGapRow = {
  entityId: number;
  entityName: string;
  schemaId: number;
  sourceName: string;
  domainName: string;
  hasOwner: boolean;
  hasSteward: boolean;
  isCertified: boolean;
  missingDescCount: number;
};

async function getDgGaps(f: ReportFilters, page: Page): Promise<{ rows: DgGapRow[]; total: number }> {
  const rows = await sql<any[]>`
    WITH scoped AS (
      SELECT
        e.entity_id, e.entity_name_text, e.schema_id,
        ds.source_name_text,
        COALESCE(dom.domain_name, 'Unassigned') AS domain_name,
        EXISTS (SELECT 1 FROM bayanat.asset_stakeholders st WHERE st.asset_type_code = 'DATA_ENTITIES' AND st.asset_id = e.entity_id AND st.role_code = 'OWNER') AS has_owner,
        EXISTS (SELECT 1 FROM bayanat.asset_stakeholders st WHERE st.asset_type_code = 'DATA_ENTITIES' AND st.asset_id = e.entity_id AND st.role_code IN ('BIZ_STEWARD', 'TECH_STEWARD')) AS has_steward,
        EXISTS (
          SELECT 1 FROM bayanat.asset_certifications c
          WHERE c.asset_type_code = 'DATA_ENTITIES' AND c.asset_id = e.entity_id
            AND (c.expiry_date IS NULL OR c.expiry_date >= CURRENT_DATE)
        ) AS is_certified,
        (
          SELECT count(*)::int FROM bayanat.data_attributes a
          WHERE a.entity_id = e.entity_id AND a.attribute_class_code = 'BUSINESS'
            AND (a.description_text IS NULL OR length(trim(a.description_text)) = 0)
        ) AS missing_desc_count
      FROM bayanat.data_entities e
      JOIN bayanat.data_schemas s  ON s.schema_id = e.schema_id
      JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
      LEFT JOIN bayanat.v_entity_business_domain dom ON dom.entity_id = e.entity_id
      WHERE e.is_view_indicator = false
        AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR dom.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT
      entity_id          AS "entityId",
      entity_name_text   AS "entityName",
      schema_id          AS "schemaId",
      source_name_text   AS "sourceName",
      domain_name        AS "domainName",
      has_owner          AS "hasOwner",
      has_steward        AS "hasSteward",
      is_certified       AS "isCertified",
      missing_desc_count AS "missingDescCount",
      count(*) OVER ()::int AS "totalCount"
    FROM scoped
    WHERE NOT (has_owner AND has_steward AND is_certified AND missing_desc_count = 0)
    ORDER BY entity_name_text
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  const total = rows[0]?.totalCount ?? 0;
  return { total, rows: rows.map((r) => ({ ...r, totalCount: undefined })) };
}

export type DgSummaryReportData = {
  kpis: KpiCardData[];
  trend: TrendPoint[];
  primaryKpiCode: string | null;
  drillDown: DgGapRow[];
  total: number;
};

export async function getDgSummaryReportData(filters: ReportFilters, page: Page = { limit: 25, offset: 0 }): Promise<DgSummaryReportData> {
  const kpis = await getReportKpiCards("R8_DG_SUMMARY", filters);
  const primaryKpiCode = kpis[0]?.kpiCode ?? null;
  const [{ rows: drillDown, total }, trend] = await Promise.all([
    getDgGaps(filters, page),
    primaryKpiCode ? getKpiSnapshotTrend(primaryKpiCode) : Promise.resolve([]),
  ]);
  return { kpis, trend, primaryKpiCode, drillDown, total };
}
