import { sql } from "../db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DqDimension = {
  code: string;
  name: string;
  description: string | null;
};

export type DqRule = {
  ruleId: number;
  ruleName: string;
  dimensionCode: string | null;
  dimensionName: string | null;
  assetTypeCode: string;
  assetId: number;
  assetName: string | null;
  /** For column-level rules: the table that owns the column */
  parentEntityName: string | null;
  schemaName: string | null;
  sourceName: string | null;
  ruleLogicTypeCode: string | null;
  ruleTemplateCode: string | null;
  ruleConfig: Record<string, unknown>;
  ruleDefinitionText: string;
  severityLevelCode: string | null;
  thresholdWarn: number | null;
  thresholdFail: number | null;
  scheduleCron: string | null;
  notifyOwners: boolean;
  openIssueOnFail: boolean;
  isActive: boolean;
  lastRunAt: string | null;
  lastStatusCode: string | null;
  lastScore: number | null;
  previousScore: number | null;
  createdAt: string;
};

export type DqResult = {
  resultId: number;
  ruleId: number;
  ruleName: string;
  dimensionCode: string | null;
  executionTimestamp: string;
  recordsScanned: number | null;
  recordsPassed: number | null;
  recordsFailed: number | null;
  failurePct: number | null;
  score: number | null;
  statusCode: string | null;
  message: string | null;
  durationMs: number | null;
};

export type DqSample = {
  sampleId: number;
  sampleValue: string;
  isValid: boolean;
  sampleCount: number;
};

export type DqEntityScore = {
  overallScore: number | null;
  completeness: number | null;
  validity: number | null;
  uniqueness: number | null;
  consistency: number | null;
  freshness: number | null;
  ruleCount: number;
  passCount: number;
  failCount: number;
  calculatedAt: string | null;
};

export type DqDashboardStats = {
  totalRules: number;
  activeRules: number;
  runsToday: number;
  passingRules: number;
  failingRules: number;
  avgScore: number | null;
};

// ── Dimensions ─────────────────────────────────────────────────────────────────

export async function getDqDimensions(): Promise<DqDimension[]> {
  const rows = await sql<{ code: string; name: string; desc: string | null }[]>`
    SELECT dimension_code AS code, dimension_name_text AS name, description_text AS desc
    FROM bayanat.dq_dimensions
    ORDER BY dimension_name_text
  `;
  return rows.map((r) => ({ code: r.code, name: r.name, description: r.desc }));
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export async function getDqRules(filters?: {
  assetTypeCode?: string;
  assetId?: number;
  /** Fetch all rules tied to this entity — both table-level (asset_id = entityId) and column-level (a.entity_id = entityId) */
  entityId?: number;
  activeOnly?: boolean;
}): Promise<DqRule[]> {
  const rows = await sql<any[]>`
    SELECT
      r.rule_id              AS "ruleId",
      r.rule_name_text       AS "ruleName",
      r.dimension_code       AS "dimensionCode",
      d.dimension_name_text  AS "dimensionName",
      r.asset_type_code      AS "assetTypeCode",
      r.asset_id             AS "assetId",
      CASE
        WHEN r.asset_type_code = 'DATA_ENTITIES'   THEN e.entity_name_text
        WHEN r.asset_type_code = 'DATA_ATTRIBUTES' THEN a.physical_name_text
        ELSE NULL
      END                    AS "assetName",
      ep.entity_name_text    AS "parentEntityName",
      s.schema_name_text     AS "schemaName",
      ds.source_name_text    AS "sourceName",
      r.rule_logic_type_code AS "ruleLogicTypeCode",
      r.rule_template_code   AS "ruleTemplateCode",
      COALESCE(r.rule_config, '{}')::jsonb AS "ruleConfig",
      r.rule_definition_text AS "ruleDefinitionText",
      r.severity_level_code  AS "severityLevelCode",
      r.threshold_warn       AS "thresholdWarn",
      r.threshold_fail       AS "thresholdFail",
      r.schedule_cron        AS "scheduleCron",
      r.notify_owners        AS "notifyOwners",
      r.open_issue_on_fail   AS "openIssueOnFail",
      r.is_active_indicator  AS "isActive",
      r.last_run_at          AS "lastRunAt",
      r.last_status_code     AS "lastStatusCode",
      r.last_score           AS "lastScore",
      (
        SELECT res2.score FROM bayanat.dq_results res2
        WHERE res2.rule_id = r.rule_id
        ORDER BY res2.execution_timestamp DESC
        LIMIT 1 OFFSET 1
      )                      AS "previousScore",
      r.created_at_timestamp AS "createdAt"
    FROM bayanat.dq_rules r
    LEFT JOIN bayanat.dq_dimensions d ON d.dimension_code = r.dimension_code
    LEFT JOIN bayanat.data_entities e  ON r.asset_type_code = 'DATA_ENTITIES'   AND e.entity_id    = r.asset_id
    LEFT JOIN bayanat.data_attributes a ON r.asset_type_code = 'DATA_ATTRIBUTES' AND a.attribute_id = r.asset_id
    LEFT JOIN bayanat.data_entities ep ON r.asset_type_code = 'DATA_ATTRIBUTES' AND ep.entity_id   = a.entity_id
    LEFT JOIN bayanat.data_schemas   s  ON s.schema_id = CASE
      WHEN r.asset_type_code = 'DATA_ENTITIES'   THEN e.schema_id
      WHEN r.asset_type_code = 'DATA_ATTRIBUTES' THEN ep.schema_id
      END
    LEFT JOIN bayanat.data_sources   ds ON ds.data_source_id = s.data_source_id
    WHERE 1=1
      ${filters?.entityId != null ? sql`
        AND (
          (r.asset_type_code = 'DATA_ENTITIES'   AND r.asset_id = ${filters.entityId})
          OR
          (r.asset_type_code = 'DATA_ATTRIBUTES' AND a.entity_id = ${filters.entityId})
        )
      ` : sql`
        ${filters?.assetTypeCode ? sql`AND r.asset_type_code = ${filters.assetTypeCode}` : sql``}
        ${filters?.assetId != null ? sql`AND r.asset_id = ${filters.assetId}` : sql``}
      `}
      ${filters?.activeOnly ? sql`AND r.is_active_indicator = true` : sql``}
    ORDER BY r.asset_type_code DESC, r.created_at_timestamp DESC
  `;
  return rows.map((r) => ({
    ...r,
    thresholdWarn:    r.thresholdWarn    != null ? Number(r.thresholdWarn)    : null,
    thresholdFail:    r.thresholdFail    != null ? Number(r.thresholdFail)    : null,
    lastScore:        r.lastScore        != null ? Number(r.lastScore)        : null,
    previousScore:    r.previousScore    != null ? Number(r.previousScore)    : null,
    parentEntityName: r.parentEntityName ?? null,
    schemaName:       r.schemaName ?? null,
    sourceName:       r.sourceName ?? null,
    ruleConfig:       typeof r.ruleConfig === "object" && r.ruleConfig !== null ? r.ruleConfig : {},
    notifyOwners:     Boolean(r.notifyOwners),
    openIssueOnFail:  Boolean(r.openIssueOnFail),
    isActive:         Boolean(r.isActive),
  }));
}

export async function getDqRuleById(ruleId: number): Promise<DqRule | null> {
  const rules = await getDqRules();
  return rules.find((r) => r.ruleId === ruleId) ?? null;
}

export async function createDqRule(data: {
  ruleName: string;
  dimensionCode: string | null;
  assetTypeCode: string;
  assetId: number;
  ruleTemplateCode: string | null;
  ruleConfig: Record<string, unknown>;
  ruleDefinitionText: string;
  severityLevelCode: string | null;
  thresholdWarn: number | null;
  thresholdFail: number | null;
  scheduleCron: string | null;
  notifyOwners: boolean;
  openIssueOnFail: boolean;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.dq_rules (
      rule_name_text, dimension_code, asset_type_code, asset_id,
      rule_logic_type_code, rule_template_code, rule_config, rule_definition_text,
      severity_level_code, threshold_warn, threshold_fail,
      schedule_cron, notify_owners, open_issue_on_fail, is_active_indicator
    ) VALUES (
      ${data.ruleName},
      ${data.dimensionCode},
      ${data.assetTypeCode},
      ${data.assetId},
      ${data.ruleTemplateCode ? "TEMPLATE" : "CUSTOM_SQL"},
      ${data.ruleTemplateCode},
      ${data.ruleConfig as any},
      ${data.ruleDefinitionText},
      ${data.severityLevelCode},
      ${data.thresholdWarn},
      ${data.thresholdFail},
      ${data.scheduleCron},
      ${data.notifyOwners},
      ${data.openIssueOnFail},
      true
    )
    RETURNING rule_id AS id
  `;
  return rows[0].id;
}

export async function updateDqRule(ruleId: number, data: Partial<{
  ruleName: string;
  dimensionCode: string | null;
  assetTypeCode: string;
  assetId: number;
  ruleTemplateCode: string | null;
  ruleConfig: Record<string, unknown>;
  ruleDefinitionText: string;
  severityLevelCode: string | null;
  thresholdWarn: number | null;
  thresholdFail: number | null;
  scheduleCron: string | null;
  notifyOwners: boolean;
  openIssueOnFail: boolean;
  isActive: boolean;
}>): Promise<void> {
  await sql`
    UPDATE bayanat.dq_rules SET
      rule_name_text       = COALESCE(${data.ruleName ?? null}, rule_name_text),
      dimension_code       = COALESCE(${data.dimensionCode ?? null}, dimension_code),
      asset_type_code      = COALESCE(${data.assetTypeCode ?? null}, asset_type_code),
      asset_id             = COALESCE(${data.assetId ?? null}, asset_id),
      rule_logic_type_code = ${data.ruleTemplateCode !== undefined
        ? (data.ruleTemplateCode ? "TEMPLATE" : "CUSTOM_SQL")
        : sql`rule_logic_type_code`},
      rule_template_code   = ${data.ruleTemplateCode !== undefined
        ? data.ruleTemplateCode
        : sql`rule_template_code`},
      rule_config          = ${(data.ruleConfig != null && Object.keys(data.ruleConfig).length > 0) ? sql`${data.ruleConfig as any}` : sql`rule_config`},
      rule_definition_text = COALESCE(${data.ruleDefinitionText ?? null}, rule_definition_text),
      severity_level_code  = COALESCE(${data.severityLevelCode ?? null}, severity_level_code),
      threshold_warn       = ${data.thresholdWarn !== undefined ? data.thresholdWarn : sql`threshold_warn`},
      threshold_fail       = ${data.thresholdFail !== undefined ? data.thresholdFail : sql`threshold_fail`},
      schedule_cron        = ${data.scheduleCron !== undefined ? data.scheduleCron : sql`schedule_cron`},
      notify_owners        = COALESCE(${data.notifyOwners ?? null}, notify_owners),
      open_issue_on_fail   = COALESCE(${data.openIssueOnFail ?? null}, open_issue_on_fail),
      is_active_indicator  = COALESCE(${data.isActive ?? null}, is_active_indicator)
    WHERE rule_id = ${ruleId}
  `;
}

export async function deleteDqRule(ruleId: number): Promise<void> {
  await sql`DELETE FROM bayanat.dq_rules WHERE rule_id = ${ruleId}`;
}

// ── Results & History ─────────────────────────────────────────────────────────

export async function getDqResults(ruleId: number, limit = 30): Promise<DqResult[]> {
  const rows = await sql<any[]>`
    SELECT
      r.result_id              AS "resultId",
      r.rule_id                AS "ruleId",
      ru.rule_name_text        AS "ruleName",
      ru.dimension_code        AS "dimensionCode",
      r.execution_timestamp    AS "executionTimestamp",
      r.records_scanned_count  AS "recordsScanned",
      r.records_passed_count   AS "recordsPassed",
      r.records_failed_count   AS "recordsFailed",
      r.failure_percentage_number AS "failurePct",
      r.score                  AS "score",
      r.status_code            AS "statusCode",
      r.result_message_text    AS "message",
      r.run_duration_ms        AS "durationMs"
    FROM bayanat.dq_results r
    JOIN bayanat.dq_rules ru ON ru.rule_id = r.rule_id
    WHERE r.rule_id = ${ruleId}
    ORDER BY r.execution_timestamp DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    ...r,
    recordsScanned: r.recordsScanned != null ? Number(r.recordsScanned) : null,
    recordsPassed:  r.recordsPassed  != null ? Number(r.recordsPassed)  : null,
    recordsFailed:  r.recordsFailed  != null ? Number(r.recordsFailed)  : null,
    failurePct:     r.failurePct     != null ? Number(r.failurePct)     : null,
    score:          r.score          != null ? Number(r.score)          : null,
    durationMs:     r.durationMs     != null ? Number(r.durationMs)     : null,
  }));
}

export async function getDqResultSamples(resultId: number): Promise<DqSample[]> {
  const rows = await sql<any[]>`
    SELECT sample_id AS "sampleId", sample_value AS "sampleValue",
           is_valid AS "isValid", sample_count AS "sampleCount"
    FROM bayanat.dq_run_samples
    WHERE result_id = ${resultId}
    ORDER BY is_valid DESC, sample_count DESC
    LIMIT 200
  `;
  return rows.map((r) => ({ ...r, isValid: Boolean(r.isValid), sampleCount: Number(r.sampleCount) }));
}

export async function getRecentDqResults(limit = 50): Promise<DqResult[]> {
  const rows = await sql<any[]>`
    SELECT
      r.result_id              AS "resultId",
      r.rule_id                AS "ruleId",
      ru.rule_name_text        AS "ruleName",
      ru.dimension_code        AS "dimensionCode",
      r.execution_timestamp    AS "executionTimestamp",
      r.records_scanned_count  AS "recordsScanned",
      r.records_passed_count   AS "recordsPassed",
      r.records_failed_count   AS "recordsFailed",
      r.failure_percentage_number AS "failurePct",
      r.score                  AS "score",
      r.status_code            AS "statusCode",
      r.result_message_text    AS "message",
      r.run_duration_ms        AS "durationMs"
    FROM bayanat.dq_results r
    JOIN bayanat.dq_rules ru ON ru.rule_id = r.rule_id
    ORDER BY r.execution_timestamp DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    ...r,
    recordsScanned: r.recordsScanned != null ? Number(r.recordsScanned) : null,
    recordsPassed:  r.recordsPassed  != null ? Number(r.recordsPassed)  : null,
    recordsFailed:  r.recordsFailed  != null ? Number(r.recordsFailed)  : null,
    failurePct:     r.failurePct     != null ? Number(r.failurePct)     : null,
    score:          r.score          != null ? Number(r.score)          : null,
    durationMs:     r.durationMs     != null ? Number(r.durationMs)     : null,
  }));
}

// ── Scores ────────────────────────────────────────────────────────────────────

export async function getEntityDqScore(entityId: number): Promise<DqEntityScore | null> {
  const rows = await sql<any[]>`
    SELECT overall_score AS "overallScore", completeness, validity, uniqueness,
           consistency, freshness, rule_count AS "ruleCount",
           pass_count AS "passCount", fail_count AS "failCount",
           calculated_at AS "calculatedAt"
    FROM bayanat.dq_entity_scores
    WHERE entity_id = ${entityId}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    overallScore: r.overallScore != null ? Number(r.overallScore) : null,
    completeness: r.completeness != null ? Number(r.completeness) : null,
    validity:     r.validity     != null ? Number(r.validity)     : null,
    uniqueness:   r.uniqueness   != null ? Number(r.uniqueness)   : null,
    consistency:  r.consistency  != null ? Number(r.consistency)  : null,
    freshness:    r.freshness    != null ? Number(r.freshness)    : null,
    ruleCount:    Number(r.ruleCount ?? 0),
    passCount:    Number(r.passCount ?? 0),
    failCount:    Number(r.failCount ?? 0),
    calculatedAt: r.calculatedAt ? String(r.calculatedAt) : null,
  };
}

export async function upsertEntityDqScore(entityId: number, score: Omit<DqEntityScore, "calculatedAt">): Promise<void> {
  await sql`
    INSERT INTO bayanat.dq_entity_scores
      (entity_id, overall_score, completeness, validity, uniqueness, consistency, freshness,
       rule_count, pass_count, fail_count, calculated_at)
    VALUES
      (${entityId}, ${score.overallScore}, ${score.completeness}, ${score.validity},
       ${score.uniqueness}, ${score.consistency}, ${score.freshness},
       ${score.ruleCount}, ${score.passCount}, ${score.failCount}, NOW())
    ON CONFLICT (entity_id) DO UPDATE SET
      overall_score = EXCLUDED.overall_score,
      completeness  = EXCLUDED.completeness,
      validity      = EXCLUDED.validity,
      uniqueness    = EXCLUDED.uniqueness,
      consistency   = EXCLUDED.consistency,
      freshness     = EXCLUDED.freshness,
      rule_count    = EXCLUDED.rule_count,
      pass_count    = EXCLUDED.pass_count,
      fail_count    = EXCLUDED.fail_count,
      calculated_at = NOW()
  `;
}

// ── Dashboard stats ───────────────────────────────────────────────────────────

export async function getDqDashboardStats(): Promise<DqDashboardStats> {
  const [rules, runs] = await Promise.all([
    sql<any[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active_indicator)::int AS active,
        COUNT(*) FILTER (WHERE last_status_code = 'PASSED')::int AS passing,
        COUNT(*) FILTER (WHERE last_status_code IN ('FAILED','ERROR'))::int AS failing,
        AVG(last_score)::numeric AS avg_score
      FROM bayanat.dq_rules
    `,
    sql<any[]>`
      SELECT COUNT(*)::int AS runs_today
      FROM bayanat.dq_results
      WHERE execution_timestamp >= CURRENT_DATE
    `,
  ]);
  const r = rules[0];
  return {
    totalRules:   Number(r.total   ?? 0),
    activeRules:  Number(r.active  ?? 0),
    runsToday:    Number(runs[0].runs_today ?? 0),
    passingRules: Number(r.passing ?? 0),
    failingRules: Number(r.failing ?? 0),
    avgScore:     r.avg_score != null ? Number(r.avg_score) : null,
  };
}

export async function getDqTrendData(days = 14): Promise<{ date: string; passed: number; failed: number; avgScore: number | null }[]> {
  const rows = await sql<any[]>`
    SELECT
      DATE(execution_timestamp) AS date,
      COUNT(*) FILTER (WHERE status_code = 'PASSED')::int AS passed,
      COUNT(*) FILTER (WHERE status_code IN ('FAILED','ERROR'))::int AS failed,
      AVG(score)::numeric AS avg_score
    FROM bayanat.dq_results
    WHERE execution_timestamp >= NOW() - (${days} || ' days')::interval
    GROUP BY DATE(execution_timestamp)
    ORDER BY date ASC
  `;
  return rows.map((r) => ({
    date:     String(r.date),
    passed:   Number(r.passed  ?? 0),
    failed:   Number(r.failed  ?? 0),
    avgScore: r.avg_score != null ? Number(r.avg_score) : null,
  }));
}

// ── Save run result (called from DQ engine API) ───────────────────────────────

export async function saveDqResult(data: {
  ruleId: number;
  recordsScanned: number | null;
  recordsPassed: number | null;
  recordsFailed: number | null;
  failurePct: number | null;
  score: number | null;
  statusCode: string;
  message: string | null;
  durationMs: number | null;
  samples: { value: string; isValid: boolean; count: number }[];
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.dq_results (
      rule_id, records_scanned_count, records_passed_count, records_failed_count,
      failure_percentage_number, score, status_code, result_message_text, run_duration_ms
    ) VALUES (
      ${data.ruleId}, ${data.recordsScanned}, ${data.recordsPassed}, ${data.recordsFailed},
      ${data.failurePct}, ${data.score}, ${data.statusCode}, ${data.message}, ${data.durationMs}
    )
    RETURNING result_id AS id
  `;
  const resultId = rows[0].id;

  // Update rule last_run metadata
  await sql`
    UPDATE bayanat.dq_rules SET
      last_run_at       = NOW(),
      last_status_code  = ${data.statusCode},
      last_score        = ${data.score}
    WHERE rule_id = ${data.ruleId}
  `;

  // Insert samples
  if (data.samples.length > 0) {
    await Promise.all(
      data.samples.map((s) =>
        sql`
          INSERT INTO bayanat.dq_run_samples (result_id, sample_value, is_valid, sample_count)
          VALUES (${resultId}, ${s.value}, ${s.isValid}, ${s.count})
        `
      )
    );
  }

  return resultId;
}
