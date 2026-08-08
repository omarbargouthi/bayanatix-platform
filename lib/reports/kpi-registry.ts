import { sql } from "../db";
import { getRetentionOverview, getCategoriesWithSchedulePct, getPurgeQueueByAction } from "../queries/retention";

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

// ── R1 — Data Catalog / Metadata (MCM) ──────────────────────────────────────

const mcmTablesCataloged: MetricFn = async (f) => {
  const rows = await sql<{ sourceName: string; count: number }[]>`
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
    SELECT source_name AS "sourceName", count(*)::int AS count
    FROM scoped
    GROUP BY source_name
  `;
  return {
    value: rows.reduce((s, r) => s + r.count, 0),
    breakdown: rows.map((r) => ({ label: r.sourceName, value: r.count })),
  };
};

const mcmTablesWithOwnerPct: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; total: number; owned: number }[]>`
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
      )::int AS owned
    FROM scoped
    GROUP BY domain_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const owned = rows.reduce((s, r) => s + r.owned, 0);
  return {
    value: total > 0 ? Math.round((owned / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.total > 0 ? Math.round((r.owned / r.total) * 100) : 0 })),
  };
};

// Identical definition to R8's completeness KPI — reused directly under a second name.
const mcmBusinessDescPct: MetricFn = (f) => dgCompletenessPct(f);

const mcmTermLinkPct: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; total: number; linked: number }[]>`
    WITH scoped AS (
      SELECT a.attribute_id, COALESCE(d.domain_name, 'Unassigned') AS domain_name
      FROM   bayanat.data_attributes a
      JOIN   bayanat.data_entities e ON e.entity_id = a.entity_id
      JOIN   bayanat.data_schemas s  ON s.schema_id = e.schema_id
      LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
      WHERE  (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT domain_name AS "domainName", count(*)::int AS total,
           count(*) FILTER (
             WHERE EXISTS (SELECT 1 FROM bayanat.asset_business_terms abt WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = scoped.attribute_id)
           )::int AS linked
    FROM scoped
    GROUP BY domain_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const linked = rows.reduce((s, r) => s + r.linked, 0);
  return {
    value: total > 0 ? Math.round((linked / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.total > 0 ? Math.round((r.linked / r.total) * 100) : 0 })),
  };
};

const mcmCompletenessScore: MetricFn = async (f) => {
  const [owner, desc, term] = await Promise.all([mcmTablesWithOwnerPct(f), mcmBusinessDescPct(f), mcmTermLinkPct(f)]);
  return {
    value: Math.round((owner.value + desc.value + term.value) / 3),
    breakdown: [
      { label: "Owner Coverage", value: owner.value },
      { label: "Description Coverage", value: desc.value },
      { label: "Term-Link Coverage", value: term.value },
    ],
  };
};

// ── R3 — Data Classification (DC) ───────────────────────────────────────────

// The real "is this column classified" signal is the CLASSIFICATION-role business
// term link (asset_business_terms → business_glossaries.classification_code), not
// the legacy data_attributes.classification_code column, which is stale in this DB
// (82/376 set vs 13/376 via the real mechanism) — same distinction already made in
// lib/queries/catalog.ts::getClassificationStats(), mirrored here for scoping/filters.
const DC_SCOPED_CTE = sql`
  scoped AS (
    SELECT
      a.attribute_id, a.classified_at_timestamp, a.suggestion_status_code,
      bg.classification_code, bg.is_pii_indicator,
      COALESCE(d.domain_name, 'Unassigned') AS domain_name
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s  ON s.schema_id = e.schema_id
    LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
    LEFT JOIN bayanat.asset_business_terms abt
      ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
    WHERE 1=1
`;

function dcScopeFilter(f: ReportFilters) {
  return sql`
    AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
    AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
  `;
}

const dcClassifiedPct: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; total: number; classified: number }[]>`
    WITH ${DC_SCOPED_CTE} ${dcScopeFilter(f)})
    SELECT domain_name AS "domainName", count(*)::int AS total, count(classification_code)::int AS classified
    FROM scoped
    GROUP BY domain_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const classified = rows.reduce((s, r) => s + r.classified, 0);
  return {
    value: total > 0 ? Math.round((classified / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.total > 0 ? Math.round((r.classified / r.total) * 100) : 0 })),
  };
};

const dcLevelDistribution: MetricFn = async (f) => {
  const rows = await sql<{ level: string; count: number }[]>`
    WITH ${DC_SCOPED_CTE} ${dcScopeFilter(f)}),
    joined AS (
      SELECT ct.class_name_text AS level
      FROM scoped s
      JOIN bayanat.classification_types ct ON ct.class_code = s.classification_code
    )
    SELECT level, count(*)::int AS count FROM joined GROUP BY level ORDER BY count DESC
  `;
  return {
    value: rows.reduce((s, r) => s + r.count, 0),
    breakdown: rows.map((r) => ({ label: r.level, value: r.count })),
  };
};

const dcPiReviewedPct: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; total: number; reviewed: number }[]>`
    WITH ${DC_SCOPED_CTE} ${dcScopeFilter(f)})
    SELECT domain_name AS "domainName", count(*)::int AS total,
           count(*) FILTER (WHERE classified_at_timestamp IS NOT NULL)::int AS reviewed
    FROM scoped
    WHERE is_pii_indicator = true
    GROUP BY domain_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const reviewed = rows.reduce((s, r) => s + r.reviewed, 0);
  return {
    value: total > 0 ? Math.round((reviewed / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.total > 0 ? Math.round((r.reviewed / r.total) * 100) : 0 })),
  };
};

// No creation timestamp exists on data_attributes, so a true backlog *age* can't be
// computed — this counts columns with a pending AI classification suggestion that
// hasn't been actioned, which is the closest real "unclassified backlog" signal.
const dcUnclassifiedBacklogCount: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; count: number }[]>`
    WITH ${DC_SCOPED_CTE} ${dcScopeFilter(f)})
    SELECT domain_name AS "domainName", count(*)::int AS count
    FROM scoped
    WHERE classification_code IS NULL AND suggestion_status_code = 'PENDING'
    GROUP BY domain_name
  `;
  return {
    value: rows.reduce((s, r) => s + r.count, 0),
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.count })),
  };
};

// ── R4 — Data Sharing (DSI) ──────────────────────────────────────────────────

// DSAs aren't directly tied to a schema/source — they relate to entities via
// dsa_datasets — so scoping by source/domain is an EXISTS check over any of a DSA's
// datasets, same pattern as R8's dgOpenRequestsByType over asset_request_targets.
const DSI_SCOPED_CTE = sql`
  scoped AS (
    SELECT dsa.dsa_id, dsa.status_code, dsa.sharing_scope_code, dsa.effective_end_date,
           dsa.submitted_at, dsa.approved_at
    FROM bayanat.data_sharing_agreements dsa
    WHERE 1=1
`;

function dsiScopeFilter(f: ReportFilters) {
  return sql`
    AND (
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
  `;
}

const dsiDsaStatus: MetricFn = async (f) => {
  const rows = await sql<{ statusCode: string; count: number }[]>`
    WITH ${DSI_SCOPED_CTE} ${dsiScopeFilter(f)})
    SELECT status_code AS "statusCode", count(*)::int AS count FROM scoped GROUP BY status_code
  `;
  return {
    value: rows.find((r) => r.statusCode === "ACTIVE")?.count ?? 0,
    breakdown: rows.map((r) => ({ label: r.statusCode, value: r.count })),
  };
};

// No due-date column exists on data_sharing_agreements, so "response SLA" is a
// documented proxy: approved within 10 calendar days of submission.
const dsiResponseSlaPct: MetricFn = async (f) => {
  const [row] = await sql<{ approvedTotal: number; onTime: number }[]>`
    WITH ${DSI_SCOPED_CTE} ${dsiScopeFilter(f)})
    SELECT
      count(*) FILTER (WHERE approved_at IS NOT NULL)::int AS "approvedTotal",
      count(*) FILTER (WHERE approved_at IS NOT NULL AND approved_at - submitted_at <= INTERVAL '10 days')::int AS "onTime"
    FROM scoped
  `;
  const approvedTotal = row?.approvedTotal ?? 0;
  const onTime = row?.onTime ?? 0;
  return {
    value: approvedTotal > 0 ? Math.round((onTime / approvedTotal) * 100) : 0,
    breakdown: [
      { label: "On Time", value: onTime },
      { label: "Late", value: approvedTotal - onTime },
    ],
  };
};

const dsiByScope: MetricFn = async (f) => {
  const rows = await sql<{ scope: string; count: number }[]>`
    WITH ${DSI_SCOPED_CTE} ${dsiScopeFilter(f)})
    SELECT COALESCE(sharing_scope_code, 'UNSPECIFIED') AS scope, count(*)::int AS count
    FROM scoped GROUP BY COALESCE(sharing_scope_code, 'UNSPECIFIED')
  `;
  return {
    value: rows.reduce((s, r) => s + r.count, 0),
    breakdown: rows.map((r) => ({ label: r.scope, value: r.count })),
  };
};

const dsiExpiringSoon: MetricFn = async (f) => {
  const [row] = await sql<{ count: number }[]>`
    WITH ${DSI_SCOPED_CTE} ${dsiScopeFilter(f)})
    SELECT count(*) FILTER (
      WHERE status_code IN ('ACTIVE', 'APPROVED')
        AND effective_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
    )::int AS count
    FROM scoped
  `;
  return { value: row?.count ?? 0, breakdown: [] };
};

// "Sharing-eligible" proxy: % of shared datasets whose parent DSA has a verified
// authorization on file (the closest real signal — no explicit eligibility flag exists).
const dsiSharingEligiblePct: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; total: number; verified: number }[]>`
    WITH scoped AS (
      SELECT dd.dsa_dataset_id, dd.dsa_id, COALESCE(d.domain_name, 'Unassigned') AS domain_name
      FROM   bayanat.dsa_datasets dd
      JOIN   bayanat.data_entities e ON e.entity_id = dd.entity_id
      JOIN   bayanat.data_schemas s  ON s.schema_id = e.schema_id
      LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
      WHERE  (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
        AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
    )
    SELECT domain_name AS "domainName", count(*)::int AS total,
           count(*) FILTER (
             WHERE EXISTS (SELECT 1 FROM bayanat.dsa_authorizations a WHERE a.dsa_id = scoped.dsa_id AND a.verified_at IS NOT NULL)
           )::int AS verified
    FROM scoped
    GROUP BY domain_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const verified = rows.reduce((s, r) => s + r.verified, 0);
  return {
    value: total > 0 ? Math.round((verified / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.total > 0 ? Math.round((r.verified / r.total) * 100) : 0 })),
  };
};

// ── R5 — Open Data (OD) ──────────────────────────────────────────────────────

// open_datasets.domain_code points at governance_domains (NDI capability domains),
// not business_glossaries — so, like DSI, business-domain scoping has to go through
// the dataset's underlying columns (open_dataset_columns → data_attributes → entity).
const OD_SCOPED_CTE = sql`
  scoped AS (
    SELECT od.dataset_id, od.status_code, od.publish_date, od.created_at
    FROM bayanat.open_datasets od
    WHERE od.deleted_at IS NULL
`;

function odScopeFilter(f: ReportFilters) {
  return sql`
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
  `;
}

const odStatusBreakdown: MetricFn = async (f) => {
  const rows = await sql<{ statusCode: string; count: number }[]>`
    WITH ${OD_SCOPED_CTE} ${odScopeFilter(f)})
    SELECT status_code AS "statusCode", count(*)::int AS count FROM scoped GROUP BY status_code
  `;
  return {
    value: rows.find((r) => r.statusCode === "PUBLISHED")?.count ?? 0,
    breakdown: rows.map((r) => ({ label: r.statusCode, value: r.count })),
  };
};

// Documented threshold: published within 30 days of creation counts as on-SLA.
const odPublicationSlaPct: MetricFn = async (f) => {
  const [row] = await sql<{ pubTotal: number; onTime: number }[]>`
    WITH ${OD_SCOPED_CTE} ${odScopeFilter(f)})
    SELECT
      count(*) FILTER (WHERE status_code = 'PUBLISHED')::int AS "pubTotal",
      count(*) FILTER (WHERE status_code = 'PUBLISHED' AND publish_date IS NOT NULL AND publish_date - created_at::date <= 30)::int AS "onTime"
    FROM scoped
  `;
  const pubTotal = row?.pubTotal ?? 0;
  const onTime = row?.onTime ?? 0;
  return { value: pubTotal > 0 ? Math.round((onTime / pubTotal) * 100) : 0, breakdown: [] };
};

const odDqDisclosurePct: MetricFn = async (f) => {
  const [row] = await sql<{ pubTotal: number; disclosed: number }[]>`
    WITH ${OD_SCOPED_CTE} ${odScopeFilter(f)})
    SELECT
      count(*) FILTER (WHERE status_code = 'PUBLISHED')::int AS "pubTotal",
      count(*) FILTER (
        WHERE status_code = 'PUBLISHED' AND EXISTS (SELECT 1 FROM bayanat.open_dataset_dq_issues i WHERE i.dataset_id = scoped.dataset_id)
      )::int AS disclosed
    FROM scoped
  `;
  const pubTotal = row?.pubTotal ?? 0;
  const disclosed = row?.disclosed ?? 0;
  return { value: pubTotal > 0 ? Math.round((disclosed / pubTotal) * 100) : 0, breakdown: [] };
};

// ── R6 — FOI ─────────────────────────────────────────────────────────────────

// Mirrors the closed-status list already used in lib/queries/foi.ts::getFoiStats().
const FOI_CLOSED_STATUSES = sql`('CLOSED','DELIVERED','REJECTED','QUOTE_DECLINED','WITHDRAWN','APPEAL_DECIDED')`;

// foi_attribute_mappings denormalizes data_source_id/data_entity_id directly, so
// scoping doesn't need to walk through data_attributes like DSI/OD did. "Owner" maps
// to assigned_officer_user_id (the closest FOI concept to a responsible person).
const FOI_SCOPED_CTE = sql`
  scoped AS (
    SELECT r.foi_request_id, r.status_code, r.submitted_at, r.first_response_due_date,
           r.closed_at, r.rejection_ground_code, r.assigned_officer_user_id
    FROM bayanat.foi_requests r
    WHERE 1=1
`;

function foiScopeFilter(f: ReportFilters) {
  return sql`
    AND (${f.ownerId ?? null}::text IS NULL OR r.assigned_officer_user_id = ${f.ownerId ?? null})
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
  `;
}

const foiStatusBreakdown: MetricFn = async (f) => {
  const rows = await sql<{ statusCode: string; count: number }[]>`
    WITH ${FOI_SCOPED_CTE} ${foiScopeFilter(f)})
    SELECT status_code AS "statusCode", count(*)::int AS count FROM scoped GROUP BY status_code
  `;
  return {
    value: rows.reduce((s, r) => s + r.count, 0),
    breakdown: rows.map((r) => ({ label: r.statusCode, value: r.count })),
  };
};

const foiOnTimePct: MetricFn = async (f) => {
  const [row] = await sql<{ total: number; onTime: number }[]>`
    WITH ${FOI_SCOPED_CTE} ${foiScopeFilter(f)})
    SELECT
      count(*)::int AS total,
      count(*) FILTER (
        WHERE (status_code NOT IN ${FOI_CLOSED_STATUSES} AND (first_response_due_date IS NULL OR first_response_due_date >= CURRENT_DATE))
           OR (status_code IN ${FOI_CLOSED_STATUSES} AND closed_at IS NOT NULL AND first_response_due_date IS NOT NULL AND closed_at::date <= first_response_due_date)
      )::int AS "onTime"
    FROM scoped
  `;
  const total = row?.total ?? 0;
  const onTime = row?.onTime ?? 0;
  return { value: total > 0 ? Math.round((onTime / total) * 100) : 0, breakdown: [] };
};

const foiAvgFulfillmentDays: MetricFn = async (f) => {
  const [row] = await sql<{ avgDays: number | null }[]>`
    WITH ${FOI_SCOPED_CTE} ${foiScopeFilter(f)})
    SELECT AVG(bayanat.ksa_business_days(submitted_at::date, closed_at::date)) AS "avgDays"
    FROM scoped
    WHERE status_code IN ${FOI_CLOSED_STATUSES} AND closed_at IS NOT NULL
  `;
  return { value: row?.avgDays != null ? Math.round(Number(row.avgDays)) : 0, breakdown: [] };
};

const foiRejectionRatePct: MetricFn = async (f) => {
  const rows = await sql<{ ground: string; count: number }[]>`
    WITH ${FOI_SCOPED_CTE} ${foiScopeFilter(f)})
    SELECT COALESCE(rejection_ground_code, 'UNSPECIFIED') AS ground, count(*)::int AS count
    FROM scoped WHERE status_code = 'REJECTED'
    GROUP BY COALESCE(rejection_ground_code, 'UNSPECIFIED')
  `;
  const [totalRow] = await sql<{ total: number }[]>`
    WITH ${FOI_SCOPED_CTE} ${foiScopeFilter(f)}) SELECT count(*)::int AS total FROM scoped
  `;
  const rejected = rows.reduce((s, r) => s + r.count, 0);
  const total = totalRow?.total ?? 0;
  return {
    value: total > 0 ? Math.round((rejected / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.ground, value: r.count })),
  };
};

const foiAppealOverturnPct: MetricFn = async (f) => {
  const [row] = await sql<{ total: number; upheld: number }[]>`
    WITH ${FOI_SCOPED_CTE} ${foiScopeFilter(f)})
    SELECT
      count(a.*)::int AS total,
      count(*) FILTER (WHERE a.decision_code = 'UPHELD')::int AS upheld
    FROM scoped
    JOIN bayanat.foi_appeals a ON a.foi_request_id = scoped.foi_request_id
  `;
  const total = row?.total ?? 0;
  const upheld = row?.upheld ?? 0;
  return { value: total > 0 ? Math.round((upheld / total) * 100) : 0, breakdown: [] };
};

const foiRevenueCollected: MetricFn = async (f) => {
  const rows = await sql<{ type: string; amount: number }[]>`
    WITH ${FOI_SCOPED_CTE} ${foiScopeFilter(f)})
    SELECT p.payment_type_code AS type, SUM(p.amount)::numeric AS amount
    FROM scoped
    JOIN bayanat.foi_payments p ON p.foi_request_id = scoped.foi_request_id
    WHERE p.received_at IS NOT NULL
    GROUP BY p.payment_type_code
  `;
  return {
    value: Math.round(rows.reduce((s, r) => s + Number(r.amount), 0)),
    breakdown: rows.map((r) => ({ label: r.type, value: Math.round(Number(r.amount)) })),
  };
};

// ── R7 — Personal Data Protection (PDP) ─────────────────────────────────────

// PI status lives on the linked CLASSIFICATION business term, not on data_attributes
// itself (same join used by R3's classification KPIs and by getDsaAttributes in
// lib/queries/sharing.ts). Column-level asset_stakeholders rows are 0 today (all
// stewardship is assigned at the table level), so ownership is rolled up from the
// column's parent entity.
const PDP_SCOPED_CTE = sql`
  scoped AS (
    SELECT
      a.attribute_id, a.entity_id, a.classified_at_timestamp,
      bg.pi_category_code, COALESCE(d.domain_name, 'Unassigned') AS domain_name
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s  ON s.schema_id = e.schema_id
    LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
    JOIN bayanat.asset_business_terms abt
      ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
    JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id AND bg.is_pii_indicator = true
    WHERE 1=1
`;

function pdpScopeFilter(f: ReportFilters) {
  return sql`
    AND (${f.sourceId ?? null}::int IS NULL OR s.data_source_id = ${f.sourceId ?? null})
    AND (${f.domainGlossaryId ?? null}::int IS NULL OR d.domain_glossary_id = ${f.domainGlossaryId ?? null})
  `;
}

const pdpPiColumnCount: MetricFn = async (f) => {
  const rows = await sql<{ category: string; count: number }[]>`
    WITH ${PDP_SCOPED_CTE} ${pdpScopeFilter(f)}),
    joined AS (
      SELECT COALESCE(pct.category_name_text, 'Uncategorized') AS category
      FROM scoped s2
      LEFT JOIN bayanat.pi_category_types pct ON pct.category_code = s2.pi_category_code
    )
    SELECT category, count(*)::int AS count FROM joined GROUP BY category ORDER BY count DESC
  `;
  return {
    value: rows.reduce((s, r) => s + r.count, 0),
    breakdown: rows.map((r) => ({ label: r.category, value: r.count })),
  };
};

const pdpPiClassifiedOwnedPct: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; total: number; classifiedOwned: number }[]>`
    WITH ${PDP_SCOPED_CTE} ${pdpScopeFilter(f)})
    SELECT domain_name AS "domainName", count(*)::int AS total,
           count(*) FILTER (
             WHERE classified_at_timestamp IS NOT NULL
               AND EXISTS (SELECT 1 FROM bayanat.asset_stakeholders st WHERE st.asset_type_code = 'DATA_ENTITIES' AND st.asset_id = scoped.entity_id AND st.role_code = 'OWNER')
           )::int AS "classifiedOwned"
    FROM scoped
    GROUP BY domain_name
  `;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const classifiedOwned = rows.reduce((s, r) => s + r.classifiedOwned, 0);
  return {
    value: total > 0 ? Math.round((classifiedOwned / total) * 100) : 0,
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.total > 0 ? Math.round((r.classifiedOwned / r.total) * 100) : 0 })),
  };
};

const pdpPiInActiveDsa: MetricFn = async (f) => {
  const rows = await sql<{ domainName: string; count: number }[]>`
    WITH ${PDP_SCOPED_CTE} ${pdpScopeFilter(f)})
    SELECT domain_name AS "domainName", count(*)::int AS count
    FROM scoped
    WHERE EXISTS (
      SELECT 1 FROM bayanat.dsa_attributes da
      JOIN bayanat.dsa_datasets dd ON dd.dsa_dataset_id = da.dsa_dataset_id
      JOIN bayanat.data_sharing_agreements dsa ON dsa.dsa_id = dd.dsa_id
      WHERE da.attribute_id = scoped.attribute_id AND da.is_personal_data_indicator = true AND dsa.status_code = 'ACTIVE'
    )
    GROUP BY domain_name
  `;
  return {
    value: rows.reduce((s, r) => s + r.count, 0),
    breakdown: rows.map((r) => ({ label: r.domainName, value: r.count })),
  };
};

// ── R9 — Retention ───────────────────────────────────────────────────────────

// Retention linkage to entities (retention_category_id/effective_expiry_date) has 0
// rows populated in this DB today, so domain/source filters wouldn't scope anything
// meaningful yet — these four KPIs are global, mirroring the existing (also
// unfiltered) /api/retention/overview behavior, rather than building filter plumbing
// for a relationship that isn't populated anywhere yet.

const retCategoriesWithSchedulesPct: MetricFn = async () => {
  const value = await getCategoriesWithSchedulePct();
  return { value, breakdown: [] };
};

const retAssetsPastRetention: MetricFn = async () => {
  const overview = await getRetentionOverview();
  return {
    value: overview.overdue,
    breakdown: overview.bySensitivity.map((r) => ({ label: r.sensitivity, value: r.count })),
  };
};

const retLegalHoldsActive: MetricFn = async () => {
  const overview = await getRetentionOverview();
  return { value: overview.activeHolds, breakdown: [] };
};

const retPurgeQueue: MetricFn = async () => {
  const rows = await getPurgeQueueByAction();
  return {
    value: rows.reduce((s, r) => s + r.count, 0),
    breakdown: rows.map((r) => ({ label: r.action, value: r.count })),
  };
};

// ── PI Access by Role (deferred Custom Asset Framework spec §7/FR-4.3) ────────
// Walks bayanat.custom_asset_links by stable rel_code, not hardcoded type ids, so
// this works whether just the "PI Access Map" template (HAS_ACCESS_TO: Role ->
// Column) is installed, or the fuller "RoPA-lite" chain (PERFORMED_BY + USES_DATA)
// is layered on top — same CTE shape lib/queries/reports.ts's drill-down query
// uses, kept in sync manually since KPI values and drill-down rows are computed
// by different functions per this file's existing convention (e.g. R2/R9 above).
const PI_ACCESS_CTE = sql`
  pi_access AS (
    SELECT l.from_asset_id AS role_id, l.to_asset_id AS attr_id
    FROM bayanat.custom_asset_links l
    JOIN bayanat.custom_relationship_types rt ON rt.rel_type_id = l.rel_type_id
    WHERE rt.rel_code = 'HAS_ACCESS_TO' AND l.to_asset_type_code = 'DATA_ATTRIBUTES'
    UNION
    SELECT pb.to_asset_id AS role_id, ud.to_asset_id AS attr_id
    FROM bayanat.custom_asset_links ud
    JOIN bayanat.custom_relationship_types udt ON udt.rel_type_id = ud.rel_type_id AND udt.rel_code = 'USES_DATA'
    JOIN bayanat.custom_asset_links pb ON pb.from_asset_type_code = ud.from_asset_type_code AND pb.from_asset_id = ud.from_asset_id
    JOIN bayanat.custom_relationship_types pbt ON pbt.rel_type_id = pb.rel_type_id AND pbt.rel_code = 'PERFORMED_BY'
    WHERE ud.to_asset_type_code = 'DATA_ATTRIBUTES'
  ),
  pi_access_scoped AS (
    SELECT DISTINCT pa.role_id, pa.attr_id, e.entity_id, ds.data_source_id, d.domain_glossary_id
    FROM pi_access pa
    JOIN bayanat.data_attributes a ON a.attribute_id = pa.attr_id
    JOIN bayanat.asset_business_terms abt ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
    JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id AND bg.is_pii_indicator = true
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    LEFT JOIN bayanat.v_entity_business_domain d ON d.entity_id = e.entity_id
  )
`;

const piAccessLinkCount: MetricFn = async (f) => {
  const rows = await sql<{ count: number }[]>`
    WITH ${PI_ACCESS_CTE}
    SELECT count(*)::int AS count FROM pi_access_scoped
    WHERE (${f.domainGlossaryId ?? null}::int IS NULL OR domain_glossary_id = ${f.domainGlossaryId ?? null})
      AND (${f.sourceId ?? null}::int IS NULL OR data_source_id = ${f.sourceId ?? null})
  `;
  return { value: rows[0]?.count ?? 0, breakdown: [] };
};

const piAccessRolesCount: MetricFn = async (f) => {
  const rows = await sql<{ count: number }[]>`
    WITH ${PI_ACCESS_CTE}
    SELECT count(DISTINCT role_id)::int AS count FROM pi_access_scoped
    WHERE (${f.domainGlossaryId ?? null}::int IS NULL OR domain_glossary_id = ${f.domainGlossaryId ?? null})
      AND (${f.sourceId ?? null}::int IS NULL OR data_source_id = ${f.sourceId ?? null})
  `;
  return { value: rows[0]?.count ?? 0, breakdown: [] };
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
  mcmTablesCataloged,
  mcmTablesWithOwnerPct,
  mcmBusinessDescPct,
  mcmTermLinkPct,
  mcmCompletenessScore,
  dcClassifiedPct,
  dcLevelDistribution,
  dcPiReviewedPct,
  dcUnclassifiedBacklogCount,
  dsiDsaStatus,
  dsiResponseSlaPct,
  dsiByScope,
  dsiExpiringSoon,
  dsiSharingEligiblePct,
  odStatusBreakdown,
  odPublicationSlaPct,
  odDqDisclosurePct,
  foiStatusBreakdown,
  foiOnTimePct,
  foiAvgFulfillmentDays,
  foiRejectionRatePct,
  foiAppealOverturnPct,
  foiRevenueCollected,
  pdpPiColumnCount,
  pdpPiClassifiedOwnedPct,
  pdpPiInActiveDsa,
  retCategoriesWithSchedulesPct,
  retAssetsPastRetention,
  retLegalHoldsActive,
  retPurgeQueue,
  piAccessLinkCount,
  piAccessRolesCount,
};
