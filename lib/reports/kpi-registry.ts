import { sql } from "../db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportFilters = {
  domainGlossaryId?: number;
  sourceId?: number;
  ownerId?: string;
};

export type KpiResult = {
  value: number;
  breakdown: { label: string; value: number }[];
};

type MetricFn = (filters: ReportFilters) => Promise<KpiResult>;

// DQ rules can target either a table (DATA_ENTITIES) or a column (DATA_ATTRIBUTES) —
// this CTE resolves the owning table either way (10 of the 12 seeded rules are
// column-level, so both branches matter) so every metric below scopes correctly by
// source/domain regardless of which asset type a rule was written against.
const SCOPED_RULES_CTE = sql`
  scoped_rules AS (
    SELECT
      r.rule_id, r.schedule_cron, r.dimension_code, r.severity_level_code,
      r.last_status_code, r.is_active_indicator,
      COALESCE(e.entity_id, ep.entity_id) AS entity_id,
      COALESCE(e.schema_id, ep.schema_id) AS schema_id
    FROM bayanat.dq_rules r
    LEFT JOIN bayanat.data_entities   e  ON r.asset_type_code = 'DATA_ENTITIES'   AND e.entity_id    = r.asset_id
    LEFT JOIN bayanat.data_attributes a  ON r.asset_type_code = 'DATA_ATTRIBUTES' AND a.attribute_id = r.asset_id
    LEFT JOIN bayanat.data_entities   ep ON r.asset_type_code = 'DATA_ATTRIBUTES' AND ep.entity_id   = a.entity_id
  )
`;

// ── R2 — Data Quality ───────────────────────────────────────────────────────

// % of physical tables (in scope) that have at least one DQ rule attached
// (directly, or on one of their columns).
const dqAssetsWithRulesPct: MetricFn = async (f) => {
  const rows = await sql<{ sourceName: string; total: number; withRules: number }[]>`
    WITH scoped AS (
      SELECT e.entity_id, ds.source_name_text AS source_name
      FROM   bayanat.data_entities e
      JOIN   bayanat.data_schemas s  ON s.schema_id = e.schema_id
      JOIN   bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
      LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
      WHERE  e.is_view_indicator = false
        AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT
      source_name AS "sourceName",
      count(*)::int AS total,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM bayanat.dq_rules r
          WHERE (r.asset_type_code = 'DATA_ENTITIES' AND r.asset_id = scoped.entity_id)
             OR (r.asset_type_code = 'DATA_ATTRIBUTES' AND r.asset_id IN (
                   SELECT attribute_id FROM bayanat.data_attributes WHERE entity_id = scoped.entity_id
                 ))
        )
      )::int AS "withRules"
    FROM scoped
    GROUP BY source_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const withRules = rows.reduce((s, r) => s + r.withRules, 0);
  return {
    value: total > 0 ? Math.round((withRules / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.sourceName, value: r.total > 0 ? Math.round((r.withRules / r.total) * 100) : 0 })),
  };
};

// % of active DQ rules (in scope) that run on a schedule rather than manually.
const dqScheduledRulesPct: MetricFn = async (f) => {
  const rows = await sql<{ sourceName: string; total: number; scheduled: number }[]>`
    WITH ${SCOPED_RULES_CTE},
    scoped AS (
      SELECT sr.schedule_cron, ds.source_name_text AS source_name
      FROM   scoped_rules sr
      JOIN   bayanat.data_schemas s  ON s.schema_id = sr.schema_id
      JOIN   bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
      LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = sr.entity_id
      WHERE  sr.is_active_indicator = true
        AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT source_name AS "sourceName", count(*)::int AS total,
           count(*) FILTER (WHERE schedule_cron IS NOT NULL)::int AS scheduled
    FROM scoped
    GROUP BY source_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const scheduled = rows.reduce((s, r) => s + r.scheduled, 0);
  return {
    value: total > 0 ? Math.round((scheduled / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.sourceName, value: r.total > 0 ? Math.round((r.scheduled / r.total) * 100) : 0 })),
  };
};

// Pass rate across all DQ result executions (in scope), broken down by dimension.
const dqPassRateByDimension: MetricFn = async (f) => {
  const rows = await sql<{ dimensionName: string; total: number; passed: number }[]>`
    WITH ${SCOPED_RULES_CTE},
    scoped AS (
      SELECT res.status_code, COALESCE(dd.dimension_name_text, 'Unclassified') AS dimension_name
      FROM   bayanat.dq_results res
      JOIN   scoped_rules sr ON sr.rule_id = res.rule_id
      LEFT JOIN bayanat.dq_dimensions dd ON dd.dimension_code = sr.dimension_code
      JOIN   bayanat.data_schemas s ON s.schema_id = sr.schema_id
      LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = sr.entity_id
      WHERE  (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT dimension_name AS "dimensionName", count(*)::int AS total,
           count(*) FILTER (WHERE status_code = 'PASSED')::int AS passed
    FROM scoped
    GROUP BY dimension_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const passed = rows.reduce((s, r) => s + r.passed, 0);
  return {
    value: total > 0 ? Math.round((passed / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.dimensionName, value: r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0 })),
  };
};

// Count of DQ rules (in scope) whose most recent run failed or errored, by severity.
const dqOpenIssuesBySeverity: MetricFn = async (f) => {
  const rows = await sql<{ severity: string; count: number }[]>`
    WITH ${SCOPED_RULES_CTE}
    SELECT COALESCE(sr.severity_level_code, 'UNSPECIFIED') AS severity, count(*)::int AS count
    FROM   scoped_rules sr
    JOIN   bayanat.data_schemas s ON s.schema_id = sr.schema_id
    LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = sr.entity_id
    WHERE  sr.last_status_code IN ('FAILED', 'ERROR')
      AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
      AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
    GROUP BY COALESCE(sr.severity_level_code, 'UNSPECIFIED')
  `;
  return {
    value: rows.reduce((s, r) => s + r.count, 0),
    breakdown: rows.map((r) => ({ label: r.severity, value: r.count })),
  };
};

// Average entity-level DQ score (in scope), broken down by business domain.
const dqScoreByDomain: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; avgScore: number | null; entityCount: number }[]>`
    WITH scoped AS (
      SELECT es.overall_score, COALESCE(d.domain_name, 'Unassigned') AS domain_name
      FROM   bayanat.dq_entity_scores es
      JOIN   bayanat.data_entities e ON e.entity_id = es.entity_id
      JOIN   bayanat.data_schemas s  ON s.schema_id = e.schema_id
      LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
      WHERE  (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT domain_name AS "domainName", AVG(overall_score)::numeric AS "avgScore", count(*)::int AS "entityCount"
    FROM scoped
    GROUP BY domain_name
  `;
  const withScores = rows.filter((r) => r.avgScore != null);
  const overall = withScores.length > 0
    ? withScores.reduce((s, r) => s + Number(r.avgScore), 0) / withScores.length
    : 0;
  return {
    value: Math.round(overall),
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.avgScore != null ? Math.round(Number(r.avgScore)) : 0 })),
  };
};

// ── R8 — DG Executive Summary ───────────────────────────────────────────────

// % of tables (in scope) with both an OWNER and a steward (BIZ_STEWARD/TECH_STEWARD) assigned.
const dgGovernanceCoveragePct: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; total: number; covered: number }[]>`
    WITH scoped AS (
      SELECT e.entity_id, COALESCE(d.domain_name, 'Unassigned') AS domain_name
      FROM   bayanat.data_entities e
      JOIN   bayanat.data_schemas s ON s.schema_id = e.schema_id
      LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
      WHERE  e.is_view_indicator = false
        AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT
      domain_name AS "domainName",
      count(*)::int AS total,
      count(*) FILTER (
        WHERE EXISTS (SELECT 1 FROM bayanat.asset_stakeholders st WHERE st.asset_type_code = 'DATA_ENTITIES' AND st.asset_id = scoped.entity_id AND st.role_code = 'OWNER')
          AND EXISTS (SELECT 1 FROM bayanat.asset_stakeholders st WHERE st.asset_type_code = 'DATA_ENTITIES' AND st.asset_id = scoped.entity_id AND st.role_code IN ('BIZ_STEWARD', 'TECH_STEWARD'))
      )::int AS covered
    FROM scoped
    GROUP BY domain_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const covered = rows.reduce((s, r) => s + r.covered, 0);
  return {
    value: total > 0 ? Math.round((covered / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.total > 0 ? Math.round((r.covered / r.total) * 100) : 0 })),
  };
};

// % of tables (in scope) with a current (non-expired) certification.
const dgCertificationPct: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; total: number; certified: number }[]>`
    WITH scoped AS (
      SELECT e.entity_id, COALESCE(d.domain_name, 'Unassigned') AS domain_name
      FROM   bayanat.data_entities e
      JOIN   bayanat.data_schemas s ON s.schema_id = e.schema_id
      LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
      WHERE  e.is_view_indicator = false
        AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT
      domain_name AS "domainName",
      count(*)::int AS total,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM bayanat.asset_certifications c
          WHERE c.asset_type_code = 'DATA_ENTITIES' AND c.asset_id = scoped.entity_id
            AND (c.expiry_date IS NULL OR c.expiry_date >= CURRENT_DATE)
        )
      )::int AS certified
    FROM scoped
    GROUP BY domain_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const certified = rows.reduce((s, r) => s + r.certified, 0);
  return {
    value: total > 0 ? Math.round((certified / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.total > 0 ? Math.round((r.certified / r.total) * 100) : 0 })),
  };
};

// % of BUSINESS-classified columns (in scope) with a non-empty description.
const dgCompletenessPct: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; total: number; described: number }[]>`
    WITH scoped AS (
      SELECT a.attribute_id, a.description_text, COALESCE(d.domain_name, 'Unassigned') AS domain_name
      FROM   bayanat.data_attributes a
      JOIN   bayanat.data_entities e ON e.entity_id = a.entity_id
      JOIN   bayanat.data_schemas s  ON s.schema_id = e.schema_id
      LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
      WHERE  a.attribute_class_code = 'BUSINESS'
        AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT domain_name AS "domainName", count(*)::int AS total,
           count(*) FILTER (WHERE description_text IS NOT NULL AND length(trim(description_text)) > 0)::int AS described
    FROM scoped
    GROUP BY domain_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const described = rows.reduce((s, r) => s + r.described, 0);
  return {
    value: total > 0 ? Math.round((described / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.total > 0 ? Math.round((r.described / r.total) * 100) : 0 })),
  };
};

// Count of open/in-progress asset requests (in scope), by request type.
// `governance_tasks` exists but is unused (0 rows) — `asset_requests` is the live
// requests system backing the /requests feature, so it's the real source here.
const dgOpenRequestsByType: MetricFn = async (f) => {
  const rows = await sql<{ requestType: string; count: number }[]>`
    WITH scoped AS (
      SELECT ar.request_id, ar.request_type_code
      FROM   bayanat.asset_requests ar
      WHERE  ar.status_code IN ('OPEN', 'IN_PROGRESS')
        AND (${f.ownerId ?? null}::text IS NULL OR ar.raised_by_user_id = ${f.ownerId ?? null} OR ar.assigned_to_user_id = ${f.ownerId ?? null})
        AND (
          (${f.domainGlossaryId ?? null}::int IS NULL AND ${f.sourceId ?? null}::int IS NULL)
          OR EXISTS (
            SELECT 1
            FROM   bayanat.asset_request_targets t
            LEFT JOIN bayanat.data_entities e ON e.entity_id = t.asset_id AND t.asset_type_code = 'DATA_ENTITIES'
            LEFT JOIN bayanat.data_schemas s  ON s.schema_id = e.schema_id
            LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
            WHERE  t.request_id = ar.request_id
              AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
              AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
          )
        )
    )
    SELECT request_type_code AS "requestType", count(*)::int AS count
    FROM scoped
    GROUP BY request_type_code
  `;
  return {
    value: rows.reduce((s, r) => s + r.count, 0),
    breakdown: rows.map((r) => ({ label: r.requestType, value: r.count })),
  };
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const KPI_REGISTRY: Record<string, MetricFn> = {
  dqAssetsWithRulesPct,
  dqScheduledRulesPct,
  dqPassRateByDimension,
  dqOpenIssuesBySeverity,
  dqScoreByDomain,
  dgGovernanceCoveragePct,
  dgCertificationPct,
  dgCompletenessPct,
  dgOpenRequestsByType,
};
