import { sql } from "../db";
import { KPI_REGISTRY, type ReportFilters, type KpiResult } from "../reports/kpi-registry";
import { runCustomKpiSql } from "../reports/kpi-sandbox";

export type { ReportFilters, KpiResult };

// ── Export audit trail (§6) ──────────────────────────────────────────────────

export async function logReportExport(reportCode: string, userId: string, filters: ReportFilters, format: "XLSX" | "PDF"): Promise<void> {
  await sql`
    INSERT INTO bayanat.report_export_audit (report_code, exported_by_user_id, filters, format)
    VALUES (${reportCode}, ${userId}, ${filters as any}, ${format})
  `;
}

export type ExportAuditRow = {
  auditId: number;
  reportCode: string;
  exportedByName: string | null;
  filters: Record<string, unknown>;
  format: string;
  exportedAt: string;
};

export async function getRecentExports(limit = 20): Promise<ExportAuditRow[]> {
  return sql<ExportAuditRow[]>`
    SELECT a.audit_id AS "auditId", a.report_code AS "reportCode", u.full_name AS "exportedByName",
           a.filters, a.format, a.exported_at::text AS "exportedAt"
    FROM bayanat.report_export_audit a
    LEFT JOIN bayanat.users u ON u.user_id = a.exported_by_user_id
    ORDER BY a.exported_at DESC
    LIMIT ${limit}
  `;
}

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
  metricKey: string | null;
  customSql: string | null;
  targetValue: number | null;
  direction: "UP" | "DOWN";
  format: "PERCENT" | "NUMBER" | "DAYS";
  sortOrder: number;
  isActive: boolean;
};

export async function getKpiDefinitions(reportCode: string): Promise<KpiDefinition[]> {
  const rows = await sql<any[]>`
    SELECT kpi_code AS "kpiCode", report_code AS "reportCode", name_en AS "nameEn", name_ar AS "nameAr",
           capability_code AS "capabilityCode", metric_key AS "metricKey", custom_sql AS "customSql",
           target_value AS "targetValue", direction, format, sort_order AS "sortOrder", is_active AS "isActive"
    FROM   bayanat.report_kpi_definitions
    WHERE  report_code = ${reportCode} AND is_active = true
    ORDER BY sort_order
  `;
  return rows.map((r) => ({ ...r, targetValue: r.targetValue != null ? Number(r.targetValue) : null }));
}

export async function getAllReportCodes(): Promise<string[]> {
  const rows = await sql<{ reportCode: string }[]>`
    SELECT DISTINCT report_code AS "reportCode" FROM bayanat.report_kpi_definitions ORDER BY report_code
  `;
  return rows.map((r) => r.reportCode);
}

// Admin view: every KPI across every report, active or not.
export async function getAllKpiDefinitions(): Promise<KpiDefinition[]> {
  const rows = await sql<any[]>`
    SELECT kpi_code AS "kpiCode", report_code AS "reportCode", name_en AS "nameEn", name_ar AS "nameAr",
           capability_code AS "capabilityCode", metric_key AS "metricKey", custom_sql AS "customSql",
           target_value AS "targetValue", direction, format, sort_order AS "sortOrder", is_active AS "isActive"
    FROM   bayanat.report_kpi_definitions
    ORDER BY report_code, sort_order
  `;
  return rows.map((r) => ({ ...r, targetValue: r.targetValue != null ? Number(r.targetValue) : null }));
}

export async function updateKpiDefinition(kpiCode: string, data: { targetValue?: number | null; isActive?: boolean }): Promise<void> {
  await sql`
    UPDATE bayanat.report_kpi_definitions SET
      target_value = ${data.targetValue !== undefined ? data.targetValue : sql`target_value`},
      is_active    = ${data.isActive !== undefined ? data.isActive : sql`is_active`}
    WHERE kpi_code = ${kpiCode}
  `;
}

export async function createCustomKpiDefinition(data: {
  kpiCode: string; reportCode: string; nameEn: string; nameAr: string | null;
  capabilityCode: string; customSql: string; targetValue: number | null;
  direction: "UP" | "DOWN"; format: "PERCENT" | "NUMBER" | "DAYS"; createdByUserId: string;
}): Promise<void> {
  await sql`
    INSERT INTO bayanat.report_kpi_definitions
      (kpi_code, report_code, name_en, name_ar, capability_code, metric_key, custom_sql,
       target_value, direction, format, sort_order, created_by_user_id)
    VALUES
      (${data.kpiCode}, ${data.reportCode}, ${data.nameEn}, ${data.nameAr}, ${data.capabilityCode}, NULL, ${data.customSql},
       ${data.targetValue}, ${data.direction}, ${data.format}, 999, ${data.createdByUserId})
  `;
}

export type KpiCardData = KpiDefinition & KpiResult;

export async function getReportKpiCards(reportCode: string, filters: ReportFilters): Promise<KpiCardData[]> {
  const defs = await getKpiDefinitions(reportCode);
  return Promise.all(
    defs.map(async (d) => {
      let result: KpiResult;
      if (d.customSql) {
        const custom = await runCustomKpiSql(d.customSql);
        result = { value: custom.value, breakdown: [] };
      } else {
        const fn = d.metricKey ? KPI_REGISTRY[d.metricKey] : undefined;
        result = fn ? await fn(filters) : { value: 0, breakdown: [] };
      }
      return { ...d, ...result };
    }),
  );
}

// ── Snapshots (trend history) ───────────────────────────────────────────────

export type TrendPoint = { periodMonth: string; value: number };

const GLOBAL_SCOPE = {} as Record<string, never>;
const domainScope = (glossaryId: number) => ({ domainGlossaryId: glossaryId });

export async function getKpiSnapshotTrend(kpiCode: string, months = 12, domainGlossaryId?: number): Promise<TrendPoint[]> {
  const scope = domainGlossaryId != null ? domainScope(domainGlossaryId) : GLOBAL_SCOPE;
  const rows = await sql<{ periodMonth: string; value: number | null }[]>`
    SELECT period_month::text AS "periodMonth", value::numeric AS value
    FROM   bayanat.report_kpi_snapshots
    WHERE  kpi_code = ${kpiCode} AND scope = ${scope as any}::jsonb
    ORDER BY period_month DESC
    LIMIT ${months}
  `;
  return rows.reverse().map((r) => ({ periodMonth: r.periodMonth, value: r.value != null ? Number(r.value) : 0 }));
}

// Captures the global (unfiltered) value for every KPI in the report, plus one
// value per business domain — the latter is what powers the Domain Scorecard's
// trend. Per-source/per-owner snapshot fan-out and the cron/backfill automation
// (FR-4) are a documented follow-up.
export async function captureSnapshot(reportCode: string): Promise<{ captured: number }> {
  const [defs, domains] = await Promise.all([getKpiDefinitions(reportCode), getBusinessDomains()]);
  const periodMonth = new Date();
  periodMonth.setUTCDate(1);
  const periodMonthStr = periodMonth.toISOString().slice(0, 10);

  let captured = 0;
  for (const d of defs) {
    // Custom-SQL KPIs are global/unfiltered only (v1 scope — no filter substitution
    // into admin-authored SQL), so there's nothing meaningful to capture per-domain.
    if (d.customSql) {
      const custom = await runCustomKpiSql(d.customSql);
      await sql`
        INSERT INTO bayanat.report_kpi_snapshots (kpi_code, scope, period_month, value)
        VALUES (${d.kpiCode}, ${GLOBAL_SCOPE as any}::jsonb, ${periodMonthStr}, ${custom.value})
        ON CONFLICT (kpi_code, scope, period_month) DO UPDATE SET value = EXCLUDED.value, captured_at = now()
      `;
      captured++;
      continue;
    }

    const fn = d.metricKey ? KPI_REGISTRY[d.metricKey] : undefined;
    if (!fn) continue;

    const global = await fn({});
    await sql`
      INSERT INTO bayanat.report_kpi_snapshots (kpi_code, scope, period_month, value)
      VALUES (${d.kpiCode}, ${GLOBAL_SCOPE as any}::jsonb, ${periodMonthStr}, ${global.value})
      ON CONFLICT (kpi_code, scope, period_month) DO UPDATE SET value = EXCLUDED.value, captured_at = now()
    `;
    captured++;

    for (const domain of domains) {
      const scoped = await fn({ domainGlossaryId: domain.glossaryId });
      await sql`
        INSERT INTO bayanat.report_kpi_snapshots (kpi_code, scope, period_month, value)
        VALUES (${d.kpiCode}, ${domainScope(domain.glossaryId) as any}::jsonb, ${periodMonthStr}, ${scoped.value})
        ON CONFLICT (kpi_code, scope, period_month) DO UPDATE SET value = EXCLUDED.value, captured_at = now()
      `;
      captured++;
    }
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

// ── R1 — Data Catalog / Metadata (MCM) report ───────────────────────────────

export type McmGapRow = {
  entityId: number;
  entityName: string;
  schemaId: number;
  sourceName: string;
  domainName: string;
  hasOwner: boolean;
  missingDescCount: number;
  unlinkedColumnCount: number;
};

async function getMcmGaps(f: ReportFilters, page: Page): Promise<{ rows: McmGapRow[]; total: number }> {
  const rows = await sql<any[]>`
    WITH scoped AS (
      SELECT
        e.entity_id, e.entity_name_text, e.schema_id, ds.source_name_text,
        COALESCE(dom.domain_name, 'Unassigned') AS domain_name,
        EXISTS (SELECT 1 FROM bayanat.asset_stakeholders st WHERE st.asset_type_code = 'DATA_ENTITIES' AND st.asset_id = e.entity_id AND st.role_code = 'OWNER') AS has_owner,
        (
          SELECT count(*)::int FROM bayanat.data_attributes a
          WHERE a.entity_id = e.entity_id AND a.attribute_class_code = 'BUSINESS'
            AND (a.description_text IS NULL OR length(trim(a.description_text)) = 0)
        ) AS missing_desc_count,
        (
          SELECT count(*)::int FROM bayanat.data_attributes a
          WHERE a.entity_id = e.entity_id
            AND NOT EXISTS (SELECT 1 FROM bayanat.asset_business_terms abt WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id)
        ) AS unlinked_column_count
      FROM bayanat.data_entities e
      JOIN bayanat.data_schemas s  ON s.schema_id = e.schema_id
      JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
      LEFT JOIN bayanat.v_entity_business_domain dom ON dom.entity_id = e.entity_id
      WHERE e.is_view_indicator = false
        AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR dom.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT
      entity_id AS "entityId", entity_name_text AS "entityName", schema_id AS "schemaId",
      source_name_text AS "sourceName", domain_name AS "domainName",
      has_owner AS "hasOwner", missing_desc_count AS "missingDescCount", unlinked_column_count AS "unlinkedColumnCount",
      count(*) OVER ()::int AS "totalCount"
    FROM scoped
    WHERE NOT (has_owner AND missing_desc_count = 0 AND unlinked_column_count = 0)
    ORDER BY entity_name_text
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  const total = rows[0]?.totalCount ?? 0;
  return { total, rows: rows.map((r) => ({ ...r, totalCount: undefined })) };
}

export type McmReportData = {
  kpis: KpiCardData[];
  trend: TrendPoint[];
  primaryKpiCode: string | null;
  drillDown: McmGapRow[];
  total: number;
};

export async function getMcmReportData(filters: ReportFilters, page: Page = { limit: 25, offset: 0 }): Promise<McmReportData> {
  const kpis = await getReportKpiCards("R1_MCM", filters);
  const primaryKpiCode = kpis[0]?.kpiCode ?? null;
  const [{ rows: drillDown, total }, trend] = await Promise.all([
    getMcmGaps(filters, page),
    primaryKpiCode ? getKpiSnapshotTrend(primaryKpiCode) : Promise.resolve([]),
  ]);
  return { kpis, trend, primaryKpiCode, drillDown, total };
}

// ── R3 — Data Classification (DC) report ────────────────────────────────────

export type DcBacklogRow = {
  attributeId: number;
  physicalName: string;
  entityId: number;
  entityName: string;
  schemaId: number;
  sourceName: string;
  domainName: string;
  isPii: boolean;
  suggestedClassCode: string | null;
  suggestionConfidence: number | null;
};

async function getDcBacklog(f: ReportFilters, page: Page): Promise<{ rows: DcBacklogRow[]; total: number }> {
  const rows = await sql<any[]>`
    WITH scoped AS (
      SELECT
        a.attribute_id, a.physical_name_text, a.suggested_class_code, a.suggestion_confidence,
        e.entity_id, e.entity_name_text, e.schema_id, ds.source_name_text,
        COALESCE(dom.domain_name, 'Unassigned') AS domain_name,
        COALESCE(bg.is_pii_indicator, false) AS is_pii
      FROM bayanat.data_attributes a
      JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
      JOIN bayanat.data_schemas s  ON s.schema_id = e.schema_id
      JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
      LEFT JOIN bayanat.v_entity_business_domain dom ON dom.entity_id = e.entity_id
      LEFT JOIN bayanat.asset_business_terms abt
        ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
      LEFT JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
      WHERE bg.classification_code IS NULL AND a.suggestion_status_code = 'PENDING'
        AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR dom.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT
      attribute_id AS "attributeId", physical_name_text AS "physicalName",
      entity_id AS "entityId", entity_name_text AS "entityName", schema_id AS "schemaId",
      source_name_text AS "sourceName", domain_name AS "domainName", is_pii AS "isPii",
      suggested_class_code AS "suggestedClassCode", suggestion_confidence::numeric AS "suggestionConfidence",
      count(*) OVER ()::int AS "totalCount"
    FROM scoped
    ORDER BY is_pii DESC, entity_name_text
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  const total = rows[0]?.totalCount ?? 0;
  return {
    total,
    rows: rows.map((r) => ({ ...r, suggestionConfidence: r.suggestionConfidence != null ? Number(r.suggestionConfidence) : null, totalCount: undefined })),
  };
}

export type DcReportData = {
  kpis: KpiCardData[];
  trend: TrendPoint[];
  primaryKpiCode: string | null;
  drillDown: DcBacklogRow[];
  total: number;
};

export async function getDcReportData(filters: ReportFilters, page: Page = { limit: 25, offset: 0 }): Promise<DcReportData> {
  const kpis = await getReportKpiCards("R3_DC", filters);
  const primaryKpiCode = kpis[0]?.kpiCode ?? null;
  const [{ rows: drillDown, total }, trend] = await Promise.all([
    getDcBacklog(filters, page),
    primaryKpiCode ? getKpiSnapshotTrend(primaryKpiCode) : Promise.resolve([]),
  ]);
  return { kpis, trend, primaryKpiCode, drillDown, total };
}

// ── R4 — Data Sharing (DSI) report ──────────────────────────────────────────

export type DsiAgreementRow = {
  dsaId: number;
  dsaReferenceCode: string;
  titleText: string;
  statusCode: string;
  sharingScopeCode: string | null;
  counterpartyName: string | null;
  effectiveEndDate: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
};

async function getDsiAgreements(f: ReportFilters, page: Page): Promise<{ rows: DsiAgreementRow[]; total: number }> {
  const rows = await sql<any[]>`
    SELECT
      dsa.dsa_id AS "dsaId", dsa.dsa_reference_code AS "dsaReferenceCode", dsa.title_text AS "titleText",
      dsa.status_code AS "statusCode", dsa.sharing_scope_code AS "sharingScopeCode",
      dsa.counterparty_name_text AS "counterpartyName", dsa.effective_end_date::text AS "effectiveEndDate",
      dsa.submitted_at::text AS "submittedAt", dsa.approved_at::text AS "approvedAt",
      count(*) OVER ()::int AS "totalCount"
    FROM bayanat.data_sharing_agreements dsa
    WHERE (
      (${f.sourceId ?? null}::int IS NULL AND ${f.domainGlossaryId ?? null}::int IS NULL)
      OR EXISTS (
        SELECT 1 FROM bayanat.dsa_datasets dd
        JOIN bayanat.data_entities e ON e.entity_id = dd.entity_id
        JOIN bayanat.data_schemas s  ON s.schema_id = e.schema_id
        LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
        WHERE dd.dsa_id = dsa.dsa_id
          AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
          AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
      )
    )
    ORDER BY dsa.submitted_at DESC NULLS LAST
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  const total = rows[0]?.totalCount ?? 0;
  return { total, rows: rows.map((r) => ({ ...r, totalCount: undefined })) };
}

export type DsiReportData = {
  kpis: KpiCardData[];
  trend: TrendPoint[];
  primaryKpiCode: string | null;
  drillDown: DsiAgreementRow[];
  total: number;
};

export async function getDsiReportData(filters: ReportFilters, page: Page = { limit: 25, offset: 0 }): Promise<DsiReportData> {
  const kpis = await getReportKpiCards("R4_DSI", filters);
  const primaryKpiCode = kpis[0]?.kpiCode ?? null;
  const [{ rows: drillDown, total }, trend] = await Promise.all([
    getDsiAgreements(filters, page),
    primaryKpiCode ? getKpiSnapshotTrend(primaryKpiCode) : Promise.resolve([]),
  ]);
  return { kpis, trend, primaryKpiCode, drillDown, total };
}

// ── R5 — Open Data (OD) report ──────────────────────────────────────────────

export type OdDatasetRow = {
  datasetId: number;
  datasetName: string;
  statusCode: string;
  categoryName: string | null;
  raisedByName: string | null;
  createdAt: string;
  publishDate: string | null;
};

async function getOdDatasets(f: ReportFilters, page: Page): Promise<{ rows: OdDatasetRow[]; total: number }> {
  const rows = await sql<any[]>`
    SELECT
      od.dataset_id AS "datasetId", od.dataset_name_text AS "datasetName", od.status_code AS "statusCode",
      dc.name AS "categoryName", u.full_name AS "raisedByName",
      od.created_at::text AS "createdAt", od.publish_date::text AS "publishDate",
      count(*) OVER ()::int AS "totalCount"
    FROM bayanat.open_datasets od
    LEFT JOIN bayanat.data_categories dc ON dc.category_id = od.category_id
    LEFT JOIN bayanat.users u ON u.user_id = od.raised_by_user_id
    WHERE od.deleted_at IS NULL
      AND (
        (${f.sourceId ?? null}::int IS NULL AND ${f.domainGlossaryId ?? null}::int IS NULL)
        OR EXISTS (
          SELECT 1 FROM bayanat.open_dataset_columns odc
          JOIN bayanat.data_attributes a ON a.attribute_id = odc.attribute_id
          JOIN bayanat.data_entities e   ON e.entity_id = a.entity_id
          JOIN bayanat.data_schemas s    ON s.schema_id = e.schema_id
          LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
          WHERE odc.dataset_id = od.dataset_id
            AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
            AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
        )
      )
    ORDER BY od.created_at DESC
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  const total = rows[0]?.totalCount ?? 0;
  return { total, rows: rows.map((r) => ({ ...r, totalCount: undefined })) };
}

export type OdReportData = {
  kpis: KpiCardData[];
  trend: TrendPoint[];
  primaryKpiCode: string | null;
  drillDown: OdDatasetRow[];
  total: number;
};

export async function getOdReportData(filters: ReportFilters, page: Page = { limit: 25, offset: 0 }): Promise<OdReportData> {
  const kpis = await getReportKpiCards("R5_OD", filters);
  const primaryKpiCode = kpis[0]?.kpiCode ?? null;
  const [{ rows: drillDown, total }, trend] = await Promise.all([
    getOdDatasets(filters, page),
    primaryKpiCode ? getKpiSnapshotTrend(primaryKpiCode) : Promise.resolve([]),
  ]);
  return { kpis, trend, primaryKpiCode, drillDown, total };
}

// ── R6 — FOI report ──────────────────────────────────────────────────────────

export type FoiRequestRow = {
  foiRequestId: number;
  referenceCode: string;
  subjectText: string;
  statusCode: string;
  submittedAt: string;
  firstResponseDueDate: string | null;
  closedAt: string | null;
  officerName: string | null;
};

async function getFoiRequestRows(f: ReportFilters, page: Page): Promise<{ rows: FoiRequestRow[]; total: number }> {
  const rows = await sql<any[]>`
    SELECT
      r.foi_request_id AS "foiRequestId", r.reference_code AS "referenceCode", r.subject_text AS "subjectText",
      r.status_code AS "statusCode", r.submitted_at::text AS "submittedAt",
      r.first_response_due_date::text AS "firstResponseDueDate", r.closed_at::text AS "closedAt",
      u.full_name AS "officerName",
      count(*) OVER ()::int AS "totalCount"
    FROM bayanat.foi_requests r
    LEFT JOIN bayanat.users u ON u.user_id = r.assigned_officer_user_id
    WHERE (${f.ownerId ?? null}::text IS NULL OR r.assigned_officer_user_id = ${f.ownerId ?? null})
      AND (
        (${f.sourceId ?? null}::int IS NULL AND ${f.domainGlossaryId ?? null}::int IS NULL)
        OR EXISTS (
          SELECT 1 FROM bayanat.foi_attribute_mappings m
          LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = m.data_entity_id
          WHERE m.foi_request_id = r.foi_request_id
            AND (${f.sourceId ?? null}::int IS NULL OR m.data_source_id = ${f.sourceId ?? null})
            AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
        )
      )
    ORDER BY r.submitted_at DESC
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  const total = rows[0]?.totalCount ?? 0;
  return { total, rows: rows.map((r) => ({ ...r, totalCount: undefined })) };
}

export type FoiReportData = {
  kpis: KpiCardData[];
  trend: TrendPoint[];
  primaryKpiCode: string | null;
  drillDown: FoiRequestRow[];
  total: number;
};

export async function getFoiReportData(filters: ReportFilters, page: Page = { limit: 25, offset: 0 }): Promise<FoiReportData> {
  const kpis = await getReportKpiCards("R6_FOI", filters);
  const primaryKpiCode = kpis[0]?.kpiCode ?? null;
  const [{ rows: drillDown, total }, trend] = await Promise.all([
    getFoiRequestRows(filters, page),
    primaryKpiCode ? getKpiSnapshotTrend(primaryKpiCode) : Promise.resolve([]),
  ]);
  return { kpis, trend, primaryKpiCode, drillDown, total };
}

// ── R7 — PDP report ──────────────────────────────────────────────────────────

export type PdpColumnRow = {
  attributeId: number;
  physicalName: string;
  entityId: number;
  entityName: string;
  schemaId: number;
  sourceName: string;
  domainName: string;
  piCategoryName: string | null;
  isClassified: boolean;
  hasOwner: boolean;
};

async function getPdpColumns(f: ReportFilters, page: Page): Promise<{ rows: PdpColumnRow[]; total: number }> {
  const rows = await sql<any[]>`
    WITH scoped AS (
      SELECT
        a.attribute_id, a.physical_name_text, a.classified_at_timestamp,
        e.entity_id, e.entity_name_text, e.schema_id, ds.source_name_text,
        COALESCE(dom.domain_name, 'Unassigned') AS domain_name,
        pct.category_name_text AS pi_category_name
      FROM bayanat.data_attributes a
      JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
      JOIN bayanat.data_schemas s  ON s.schema_id = e.schema_id
      JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
      LEFT JOIN bayanat.v_entity_business_domain dom ON dom.entity_id = e.entity_id
      JOIN bayanat.asset_business_terms abt
        ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
      JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id AND bg.is_pii_indicator = true
      LEFT JOIN bayanat.pi_category_types pct ON pct.category_code = bg.pi_category_code
      WHERE (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR dom.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT
      attribute_id AS "attributeId", physical_name_text AS "physicalName",
      entity_id AS "entityId", entity_name_text AS "entityName", schema_id AS "schemaId",
      source_name_text AS "sourceName", domain_name AS "domainName", pi_category_name AS "piCategoryName",
      (classified_at_timestamp IS NOT NULL) AS "isClassified",
      EXISTS (SELECT 1 FROM bayanat.asset_stakeholders st WHERE st.asset_type_code = 'DATA_ENTITIES' AND st.asset_id = scoped.entity_id AND st.role_code = 'OWNER') AS "hasOwner",
      count(*) OVER ()::int AS "totalCount"
    FROM scoped
    ORDER BY entity_name_text, physical_name_text
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  const total = rows[0]?.totalCount ?? 0;
  return { total, rows: rows.map((r) => ({ ...r, totalCount: undefined })) };
}

export type PdpReportData = {
  kpis: KpiCardData[];
  trend: TrendPoint[];
  primaryKpiCode: string | null;
  drillDown: PdpColumnRow[];
  total: number;
};

export async function getPdpReportData(filters: ReportFilters, page: Page = { limit: 25, offset: 0 }): Promise<PdpReportData> {
  const kpis = await getReportKpiCards("R7_PDP", filters);
  const primaryKpiCode = kpis[0]?.kpiCode ?? null;
  const [{ rows: drillDown, total }, trend] = await Promise.all([
    getPdpColumns(filters, page),
    primaryKpiCode ? getKpiSnapshotTrend(primaryKpiCode) : Promise.resolve([]),
  ]);
  return { kpis, trend, primaryKpiCode, drillDown, total };
}

// ── R9 — Retention report ────────────────────────────────────────────────────

export type RetOverdueRow = {
  entityId: number;
  entityName: string;
  schemaId: number;
  sourceName: string;
  effectiveExpiryDate: string | null;
  retentionStatus: string | null;
  categoryName: string | null;
  postRetentionAction: string | null;
};

async function getRetOverdueAssets(page: Page): Promise<{ rows: RetOverdueRow[]; total: number }> {
  const rows = await sql<any[]>`
    SELECT
      e.entity_id AS "entityId", e.entity_name_text AS "entityName", e.schema_id AS "schemaId",
      ds.source_name_text AS "sourceName", e.effective_expiry_date::text AS "effectiveExpiryDate",
      e.retention_status AS "retentionStatus", dc.name AS "categoryName", rs.post_retention_action AS "postRetentionAction",
      count(*) OVER ()::int AS "totalCount"
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s  ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    LEFT JOIN bayanat.data_categories dc ON dc.category_id = e.retention_category_id
    LEFT JOIN bayanat.retention_schedules rs ON rs.category_id = e.retention_category_id AND rs.is_default = true
    WHERE e.effective_expiry_date IS NOT NULL
      AND e.effective_expiry_date < CURRENT_DATE
      AND (e.retention_status IS NULL OR e.retention_status NOT IN ('PURGED', 'ARCHIVED'))
    ORDER BY e.effective_expiry_date ASC
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  const total = rows[0]?.totalCount ?? 0;
  return { total, rows: rows.map((r) => ({ ...r, totalCount: undefined })) };
}

export type RetReportData = {
  kpis: KpiCardData[];
  trend: TrendPoint[];
  primaryKpiCode: string | null;
  drillDown: RetOverdueRow[];
  total: number;
};

// Retention filters (domain/source) aren't applied here — see the comment in
// lib/reports/kpi-registry.ts's R9 section for why (0 entities have retention
// linkage populated yet, so there's nothing for a filter to scope).
export async function getRetReportData(filters: ReportFilters, page: Page = { limit: 25, offset: 0 }): Promise<RetReportData> {
  const kpis = await getReportKpiCards("R9_RETENTION", filters);
  const primaryKpiCode = kpis[0]?.kpiCode ?? null;
  const [{ rows: drillDown, total }, trend] = await Promise.all([
    getRetOverdueAssets(page),
    primaryKpiCode ? getKpiSnapshotTrend(primaryKpiCode) : Promise.resolve([]),
  ]);
  return { kpis, trend, primaryKpiCode, drillDown, total };
}

// ── Domain Scorecard (§4) ────────────────────────────────────────────────────

const SCORECARD_REPORT_LABELS: Record<string, string> = {
  R1_MCM: "Data Catalog / Metadata",
  R2_DQ: "Data Quality",
  R3_DC: "Data Classification",
  R4_DSI: "Data Sharing",
  R5_OD: "Open Data",
  R6_FOI: "FOI",
  R7_PDP: "Personal Data Protection",
  R8_DG_SUMMARY: "DG Executive Summary",
  R9_RETENTION: "Retention",
};

export type DomainScorecardCapability = {
  reportCode: string;
  reportLabel: string;
  kpiCode: string;
  kpiName: string;
  kpiNameAr: string | null;
  value: number;
  targetValue: number | null;
  direction: "UP" | "DOWN";
  format: "PERCENT" | "NUMBER" | "DAYS";
  trend: TrendPoint[];
};

export type DomainStewardRow = { userId: string; fullName: string; email: string; assignedAt: string };

export type DomainScorecard = {
  domain: BusinessDomain;
  capabilities: DomainScorecardCapability[];
  topIssues: { label: string; detail: string; href: string }[];
  stewards: DomainStewardRow[];
  ownerName: string | null;
};

// Each report's sort_order=1 KPI is treated as that capability's scorecard
// representative — no separate "is this the headline KPI" column needed.
export async function getDomainScorecard(glossaryId: number): Promise<DomainScorecard | null> {
  const domains = await getBusinessDomains();
  const domain = domains.find((d) => d.glossaryId === glossaryId);
  if (!domain) return null;

  const reportCodes = Object.keys(SCORECARD_REPORT_LABELS);
  const capabilityRows = await Promise.all(
    reportCodes.map(async (reportCode): Promise<DomainScorecardCapability | null> => {
      const defs = await getKpiDefinitions(reportCode);
      const primary = defs[0];
      if (!primary) return null;
      const fn = primary.metricKey ? KPI_REGISTRY[primary.metricKey] : undefined;
      const [result, trend] = await Promise.all([
        fn ? fn({ domainGlossaryId: glossaryId }) : Promise.resolve({ value: 0, breakdown: [] }),
        getKpiSnapshotTrend(primary.kpiCode, 12, glossaryId),
      ]);
      return {
        reportCode, reportLabel: SCORECARD_REPORT_LABELS[reportCode],
        kpiCode: primary.kpiCode, kpiName: primary.nameEn, kpiNameAr: primary.nameAr, value: result.value,
        targetValue: primary.targetValue, direction: primary.direction, format: primary.format, trend,
      };
    }),
  );

  const [dq, dg, stewards, ownerRows] = await Promise.all([
    getDqReportData({ domainGlossaryId: glossaryId }, { limit: 5, offset: 0 }),
    getDgSummaryReportData({ domainGlossaryId: glossaryId }, { limit: 5, offset: 0 }),
    sql<DomainStewardRow[]>`
      SELECT gs.user_id AS "userId", u.full_name AS "fullName", u.email, gs.assigned_at::text AS "assignedAt"
      FROM bayanat.glossary_stewards gs JOIN bayanat.users u ON u.user_id = gs.user_id
      WHERE gs.glossary_id = ${glossaryId}
      ORDER BY u.full_name
    `,
    sql<{ ownerName: string | null }[]>`
      SELECT u.full_name AS "ownerName" FROM bayanat.business_glossaries bg
      LEFT JOIN bayanat.users u ON u.user_id = bg.owner_user_id
      WHERE bg.glossary_id = ${glossaryId}
    `,
  ]);

  const topIssues = [
    ...dq.drillDown.slice(0, 5).map((r) => ({
      label: r.ruleName, detail: `${r.entityName} — ${r.statusCode}`, href: `/catalog/${r.schemaId}/tables/${r.entityId}`,
    })),
    ...dg.drillDown.slice(0, 5).map((r) => ({
      label: r.entityName,
      detail: `Missing: ${[!r.hasOwner && "owner", !r.hasSteward && "steward", !r.isCertified && "certification"].filter(Boolean).join(", ") || "column descriptions"}`,
      href: `/catalog/${r.schemaId}/tables/${r.entityId}`,
    })),
  ];

  return {
    domain,
    capabilities: capabilityRows.filter((c): c is DomainScorecardCapability => c != null),
    topIssues,
    stewards,
    ownerName: ownerRows[0]?.ownerName ?? null,
  };
}
