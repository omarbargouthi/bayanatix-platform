/**
 * DQ Execution Engine
 * Runs template-based and custom SQL data quality rules against source data.
 * Template types: NOT_NULL, COMPLETENESS_RATE, REGEX_MATCH, VALUE_IN_LIST,
 *                 RANGE_CHECK, UNIQUE, ROW_COUNT_THRESHOLD, FRESHNESS_CHECK, CUSTOM_SQL
 */

import postgres from "postgres";
import { sql } from "./db";
import { getDqRuleById, saveDqResult } from "./queries/dq";
import type { DqRule } from "./queries/dq";
import { startWorkflow } from "./workflow";

export type RunResult = {
  ruleId: number;
  resultId: number;
  statusCode: "PASSED" | "FAILED" | "ERROR" | "WARNING";
  score: number | null;
  recordsScanned: number | null;
  recordsPassed: number | null;
  recordsFailed: number | null;
  failurePct: number | null;
  message: string;
  durationMs: number;
};

import { DQ_TEMPLATES } from "./dq-templates";
import type { TemplateCode } from "./dq-templates";

// ── Source connection helper ──────────────────────────────────────────────────

async function getSourceSql(rule: DqRule): Promise<ReturnType<typeof postgres> | null> {
  const rows = await sql<{
    host: string; port: number; dbName: string; username: string; password: string;
  }[]>`
    SELECT cr.host_address AS host, cr.port_number::int AS port,
           cr.database_name AS "dbName",
           cr.username_text AS username, cr.password_text AS password
    FROM bayanat.connection_registry cr
    JOIN bayanat.data_sources ds ON ds.connection_id = cr.connection_id
    JOIN bayanat.data_schemas  s  ON s.data_source_id = ds.data_source_id
    JOIN bayanat.data_entities e  ON e.schema_id      = s.schema_id
    ${rule.assetTypeCode === "DATA_ATTRIBUTES"
      ? sql`JOIN bayanat.data_attributes a ON a.entity_id = e.entity_id AND a.attribute_id = ${rule.assetId}`
      : sql`AND e.entity_id = ${rule.assetId}`}
    WHERE cr.host_address IS NOT NULL
    LIMIT 1
  `;
  if (rows.length === 0 || !rows[0].host) return null;
  const { host, port, dbName, username, password } = rows[0];
  return postgres(
    `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${dbName}`,
    { max: 1, connect_timeout: 5, ssl: "prefer", transform: { undefined: null } }
  );
}

// ── Engine: run a single rule ─────────────────────────────────────────────────

export async function runDqRule(ruleId: number): Promise<RunResult> {
  const rule = await getDqRuleById(ruleId);
  if (!rule) throw new Error(`Rule ${ruleId} not found`);

  const start = Date.now();

  try {
    const meta = await resolveAssetMeta(rule);
    const engineResult = await executeTemplate(rule, meta);
    const durationMs = Date.now() - start;

    const score = engineResult.recordsScanned
      ? Math.max(0, Math.min(100, 100 - (engineResult.failurePct ?? 0)))
      : null;

    const statusCode = engineResult.statusOverride ?? determineStatus(rule, engineResult.failurePct, score);

    const resultId = await saveDqResult({
      ruleId,
      recordsScanned: engineResult.recordsScanned,
      recordsPassed: engineResult.recordsPassed,
      recordsFailed: engineResult.recordsFailed,
      failurePct: engineResult.failurePct,
      score,
      statusCode,
      message: engineResult.message,
      durationMs,
      samples: engineResult.samples ?? [],
    });

    if (statusCode === "FAILED") {
      void handleFailureActions(rule, engineResult.message).catch(() => {});
    }

    return { ruleId, resultId, statusCode, score, durationMs, ...engineResult };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    const resultId = await saveDqResult({
      ruleId,
      recordsScanned: null,
      recordsPassed: null,
      recordsFailed: null,
      failurePct: null,
      score: null,
      statusCode: "ERROR",
      message,
      durationMs,
      samples: [],
    });

    return { ruleId, resultId, statusCode: "ERROR", score: null, recordsScanned: null, recordsPassed: null, recordsFailed: null, failurePct: null, message, durationMs };
  }
}

// ── Post-run failure actions ──────────────────────────────────────────────────

async function handleFailureActions(rule: DqRule, message: string): Promise<void> {
  const title = `DQ Failure: ${rule.ruleName}`;

  if (rule.openIssueOnFail) {
    // Skip if an open FIX_DATA_ISSUE for this exact rule already exists (avoid duplicate tickets)
    const existing = await sql<{ id: number }[]>`
      SELECT ar.request_id AS id
      FROM bayanat.asset_requests ar
      JOIN bayanat.asset_request_targets art ON art.request_id = ar.request_id
      WHERE ar.request_type_code = 'FIX_DATA_ISSUE'
        AND ar.status_code IN ('OPEN','IN_PROGRESS')
        AND art.asset_type_code = ${rule.assetTypeCode}
        AND art.asset_id = ${rule.assetId}
        AND ar.title = ${title}
      LIMIT 1
    `;

    if (existing.length === 0) {
      const priority = rule.severityLevelCode === "CRITICAL" ? "HIGH"
        : rule.severityLevelCode === "INFO"    ? "LOW" : "MEDIUM";

      const [req] = await sql<{ requestId: number }[]>`
        INSERT INTO bayanat.asset_requests
          (request_type_code, title, description_text, priority_code, raised_by_user_id)
        VALUES (
          'FIX_DATA_ISSUE', ${title},
          ${"Automated: DQ rule \"" + rule.ruleName + "\" failed — " + message},
          ${priority}, 'SYSTEM'
        )
        RETURNING request_id AS "requestId"
      `;

      await sql`
        INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
        VALUES (${req.requestId}, ${rule.assetTypeCode}, ${rule.assetId}, ${rule.assetName ?? null})
      `;

      await startWorkflow(req.requestId, "FIX_DATA_ISSUE", title).catch(() => {});
    }
  }

  if (rule.notifyOwners) {
    const stakeholders = await sql<{ userId: string }[]>`
      SELECT user_id AS "userId"
      FROM bayanat.asset_stakeholders
      WHERE asset_type_code = ${rule.assetTypeCode}
        AND asset_id = ${rule.assetId}
    `;
    for (const s of stakeholders) {
      await sql`
        INSERT INTO bayanat.notifications
          (user_id, type, title, body, severity, action_label, action_href)
        VALUES (
          ${s.userId}, 'WORKFLOW',
          ${"DQ Rule Failed: " + rule.ruleName},
          ${message},
          'WARNING', 'View Rules', '/quality'
        )
      `.catch(() => {});
    }
  }
}

// ── Template execution ────────────────────────────────────────────────────────

type AssetMeta = {
  tableName: string | null;
  columnName: string | null;
  schemaName: string | null;
  qualifiedTable: string | null;
  qualifiedColumn: string | null;
};

async function resolveAssetMeta(rule: DqRule): Promise<AssetMeta> {
  if (rule.assetTypeCode === "DATA_ENTITIES") {
    const rows = await sql<{ tableName: string; schemaName: string | null }[]>`
      SELECT e.entity_name_text AS "tableName", s.schema_name_text AS "schemaName"
      FROM bayanat.data_entities e
      LEFT JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE e.entity_id = ${rule.assetId}
    `;
    if (rows.length === 0) return { tableName: null, columnName: null, schemaName: null, qualifiedTable: null, qualifiedColumn: null };
    const r = rows[0];
    const qt = r.schemaName ? `"${r.schemaName}"."${r.tableName}"` : `"${r.tableName}"`;
    return { tableName: r.tableName, columnName: null, schemaName: r.schemaName, qualifiedTable: qt, qualifiedColumn: null };
  }
  if (rule.assetTypeCode === "DATA_ATTRIBUTES") {
    const rows = await sql<{ colName: string; tableName: string; schemaName: string | null }[]>`
      SELECT a.physical_name_text AS "colName", e.entity_name_text AS "tableName", s.schema_name_text AS "schemaName"
      FROM bayanat.data_attributes a
      JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
      LEFT JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE a.attribute_id = ${rule.assetId}
    `;
    if (rows.length === 0) return { tableName: null, columnName: null, schemaName: null, qualifiedTable: null, qualifiedColumn: null };
    const r = rows[0];
    const qt = r.schemaName ? `"${r.schemaName}"."${r.tableName}"` : `"${r.tableName}"`;
    return { tableName: r.tableName, columnName: r.colName, schemaName: r.schemaName, qualifiedTable: qt, qualifiedColumn: `"${r.colName}"` };
  }
  return { tableName: null, columnName: null, schemaName: null, qualifiedTable: null, qualifiedColumn: null };
}

type EngineResult = {
  recordsScanned: number | null;
  recordsPassed: number | null;
  recordsFailed: number | null;
  failurePct: number | null;
  message: string;
  samples?: { value: string; isValid: boolean; count: number }[];
  statusOverride?: "PASSED" | "FAILED" | "WARNING" | "ERROR";
};

// Quote an identifier safely (double-quote, escape internal double quotes)
function qi(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function executeTemplate(rule: DqRule, meta: AssetMeta): Promise<EngineResult> {
  const cfg = rule.ruleConfig as Record<string, unknown>;
  const tpl = rule.ruleTemplateCode ?? "CUSTOM_SQL";

  switch (tpl) {

    // ── Uses catalog profiling data ───────────────────────────────────────────

    case "NOT_NULL": {
      if (!meta.columnName) return simErr("Column not specified");
      const rows = await sql<any[]>`
        SELECT null_percentage AS "nullPct", row_count_estimate AS "rowCount"
        FROM bayanat.data_attributes a
        JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
        WHERE a.physical_name_text = ${meta.columnName}
          AND e.entity_name_text   = ${meta.tableName}
        LIMIT 1
      `;
      if (rows.length === 0) return simErr("Column profiling data not available");
      const nullPct  = Number(rows[0].nullPct ?? 0);
      const rowCount = Number(rows[0].rowCount ?? 0);
      const failed   = Math.round((nullPct / 100) * rowCount);
      return {
        recordsScanned: rowCount, recordsPassed: rowCount - failed, recordsFailed: failed,
        failurePct: nullPct, message: `${nullPct.toFixed(2)}% null values found`,
        samples: nullPct > 0 ? [{ value: "(null)", isValid: false, count: failed }] : [],
      };
    }

    case "COMPLETENESS_RATE": {
      const maxNullPct = Number(cfg.max_null_pct ?? 5);
      if (!meta.columnName || !meta.qualifiedTable) return simErr("Column not specified");

      const srcSql = await getSourceSql(rule);
      if (srcSql) {
        try {
          const col = qi(meta.columnName);
          const tbl = meta.qualifiedTable;
          const countRows = await srcSql.unsafe(`
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE ${col} IS NULL)::int AS nulls
            FROM ${tbl}
          `) as any[];
          const total  = Number(countRows[0]?.total ?? 0);
          const nulls  = Number(countRows[0]?.nulls ?? 0);
          const nullPct = total > 0 ? (nulls / total) * 100 : 0;
          const statusOverride: EngineResult["statusOverride"] = nullPct > maxNullPct ? "FAILED" : "PASSED";
          return {
            recordsScanned: total, recordsPassed: total - nulls, recordsFailed: nulls,
            failurePct: nullPct, statusOverride,
            message: `Null rate: ${nullPct.toFixed(2)}% (max allowed: ${maxNullPct}%)`,
            samples: nulls > 0 ? [{ value: "(null)", isValid: false, count: nulls }] : [],
          };
        } finally {
          await srcSql.end();
        }
      }

      // Fallback: catalog profiling data
      const rows = await sql<any[]>`
        SELECT null_percentage AS "nullPct", row_count_estimate AS "rowCount"
        FROM bayanat.data_attributes a
        JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
        WHERE a.physical_name_text = ${meta.columnName}
          AND e.entity_name_text   = ${meta.tableName}
        LIMIT 1
      `;
      if (rows.length === 0) return simErr("Column profiling data not available");
      const nullPct  = Number(rows[0].nullPct ?? 0);
      const rowCount = Number(rows[0].rowCount ?? 0);
      const failed   = Math.round((nullPct / 100) * rowCount);
      const statusOverride: EngineResult["statusOverride"] = nullPct > maxNullPct ? "FAILED" : "PASSED";
      return {
        recordsScanned: rowCount, recordsPassed: rowCount - failed, recordsFailed: failed,
        failurePct: nullPct, statusOverride,
        message: `Null rate: ${nullPct.toFixed(2)}% (max allowed: ${maxNullPct}%)`,
      };
    }

    case "UNIQUE": {
      if (!meta.columnName) return simErr("Column not specified");
      const rows = await sql<any[]>`
        SELECT distinct_count AS "distinctCount", row_count_estimate AS "rowCount"
        FROM bayanat.data_attributes a
        JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
        WHERE a.physical_name_text = ${meta.columnName}
          AND e.entity_name_text   = ${meta.tableName}
        LIMIT 1
      `;
      if (rows.length === 0) return simErr("Column profiling data not available");
      const distinct  = Number(rows[0].distinctCount ?? 0);
      const rowCount  = Number(rows[0].rowCount ?? 0);
      const duplicates = Math.max(0, rowCount - distinct);
      const failurePct = rowCount > 0 ? (duplicates / rowCount) * 100 : 0;
      return {
        recordsScanned: rowCount, recordsPassed: distinct, recordsFailed: duplicates,
        failurePct, message: `${distinct} distinct values out of ${rowCount} rows (${duplicates} duplicates)`,
      };
    }

    case "ROW_COUNT_THRESHOLD": {
      const minRows = Number(cfg.min_rows ?? 100);
      const rows = await sql<any[]>`
        SELECT row_count_estimate AS "rowCount"
        FROM bayanat.data_entities
        WHERE entity_id = ${rule.assetId}
      `;
      if (rows.length === 0) return simErr("Entity not found");
      const rowCount = Number(rows[0].rowCount ?? 0);
      const ok = rowCount >= minRows;
      return {
        recordsScanned: rowCount, recordsPassed: ok ? rowCount : 0, recordsFailed: ok ? 0 : 1,
        failurePct: ok ? 0 : 100,
        message: `Row count: ${rowCount.toLocaleString()} (minimum: ${minRows.toLocaleString()})`,
      };
    }

    // ── Live source queries ───────────────────────────────────────────────────

    case "VALUE_IN_LIST": {
      const allowed = String(cfg.allowed_values ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (allowed.length === 0) return simErr("No allowed values configured");
      if (!meta.qualifiedTable || !meta.columnName) return simErr("Asset metadata missing");

      const srcSql = await getSourceSql(rule);
      if (!srcSql) return simErr("No source connection configured for this asset");

      try {
        const col = qi(meta.columnName);
        const tbl = meta.qualifiedTable;

        // Count: failed = NULL or value not in allowed list (case-sensitive)
        const arrayPlaceholders = allowed.map((_, i) => `$${i + 1}`).join(",");
        const countRows = await srcSql.unsafe(`
          SELECT
            COUNT(*)::int               AS total,
            COUNT(*) FILTER (
              WHERE ${col} IS NULL
                 OR ${col}::text != ALL(ARRAY[${arrayPlaceholders}])
            )::int AS failed
          FROM ${tbl}
        `, allowed) as any[];

        const total  = Number(countRows[0]?.total  ?? 0);
        const failed = Number(countRows[0]?.failed ?? 0);
        const failurePct = total > 0 ? (failed / total) * 100 : 0;

        // Capture samples of invalid values
        const badRows = await srcSql.unsafe(`
          SELECT COALESCE(${col}::text, '(null)') AS value, COUNT(*)::int AS cnt
          FROM ${tbl}
          WHERE ${col} IS NULL
             OR ${col}::text != ALL(ARRAY[${arrayPlaceholders}])
          GROUP BY ${col}::text
          ORDER BY cnt DESC
          LIMIT 20
        `, allowed) as any[];

        const goodRows = await srcSql.unsafe(`
          SELECT ${col}::text AS value, COUNT(*)::int AS cnt
          FROM ${tbl}
          WHERE ${col}::text = ANY(ARRAY[${arrayPlaceholders}])
          GROUP BY ${col}::text
          ORDER BY cnt DESC
          LIMIT 10
        `, allowed) as any[];

        const samples = [
          ...badRows.map((r: any)  => ({ value: String(r.value), isValid: false, count: Number(r.cnt) })),
          ...goodRows.map((r: any) => ({ value: String(r.value), isValid: true,  count: Number(r.cnt) })),
        ];

        return {
          recordsScanned: total, recordsPassed: total - failed, recordsFailed: failed,
          failurePct,
          message: `Allowed: [${allowed.join(", ")}] — ${failed} of ${total} values outside list or null`,
          samples,
        };
      } finally {
        await srcSql.end();
      }
    }

    case "REGEX_MATCH": {
      const pattern = String(cfg.pattern ?? "");
      if (!pattern) return simErr("No regex pattern configured");
      if (!meta.qualifiedTable || !meta.columnName) return simErr("Asset metadata missing");

      const srcSql = await getSourceSql(rule);
      if (!srcSql) return simErr("No source connection configured for this asset");

      try {
        const col = qi(meta.columnName);
        const tbl = meta.qualifiedTable;

        const countRows = await srcSql.unsafe(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE ${col} IS NULL OR ${col}::text !~ $1
            )::int AS failed
          FROM ${tbl}
        `, [pattern]) as any[];

        const total  = Number(countRows[0]?.total  ?? 0);
        const failed = Number(countRows[0]?.failed ?? 0);
        const failurePct = total > 0 ? (failed / total) * 100 : 0;

        const badRows = await srcSql.unsafe(`
          SELECT COALESCE(${col}::text, '(null)') AS value, COUNT(*)::int AS cnt
          FROM ${tbl}
          WHERE ${col} IS NULL OR ${col}::text !~ $1
          GROUP BY ${col}::text
          ORDER BY cnt DESC
          LIMIT 20
        `, [pattern]) as any[];

        return {
          recordsScanned: total, recordsPassed: total - failed, recordsFailed: failed,
          failurePct,
          message: `Pattern /${pattern}/ — ${failed} of ${total} values invalid or null`,
          samples: badRows.map((r: any) => ({ value: String(r.value), isValid: false, count: Number(r.cnt) })),
        };
      } finally {
        await srcSql.end();
      }
    }

    case "RANGE_CHECK": {
      const minVal = cfg.min_value != null && cfg.min_value !== "" ? Number(cfg.min_value) : null;
      const maxVal = cfg.max_value != null && cfg.max_value !== "" ? Number(cfg.max_value) : null;
      if (minVal === null && maxVal === null) return simErr("No range bounds configured");
      if (!meta.qualifiedTable || !meta.columnName) return simErr("Asset metadata missing");

      const srcSql = await getSourceSql(rule);
      if (!srcSql) {
        // Fall back to profiling data
        const rows = await sql<any[]>`
          SELECT min_value AS "minVal", max_value AS "maxVal", row_count_estimate AS "rowCount"
          FROM bayanat.data_attributes a
          JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
          WHERE a.physical_name_text = ${meta.columnName}
            AND e.entity_name_text   = ${meta.tableName}
          LIMIT 1
        `;
        if (rows.length === 0) return simErr("Profiling data not available");
        const rowCount  = Number(rows[0].rowCount ?? 0);
        const actualMin = rows[0].minVal != null ? Number(rows[0].minVal) : null;
        const actualMax = rows[0].maxVal != null ? Number(rows[0].maxVal) : null;
        const outOfRange =
          (minVal != null && actualMin != null && actualMin < minVal) ||
          (maxVal != null && actualMax != null && actualMax > maxVal);
        const failPct = outOfRange ? 100 : 0;
        return {
          recordsScanned: rowCount, recordsPassed: outOfRange ? 0 : rowCount, recordsFailed: outOfRange ? rowCount : 0,
          failurePct: failPct,
          message: `Range [${minVal ?? "—"}, ${maxVal ?? "—"}] — actual [${actualMin ?? "?"}, ${actualMax ?? "?"}]`,
        };
      }

      try {
        const col = qi(meta.columnName);
        const tbl = meta.qualifiedTable;
        const conditions: string[] = [`${col} IS NULL`];
        const params: number[] = [];
        if (minVal !== null) { params.push(minVal); conditions.push(`${col}::numeric < $${params.length}`); }
        if (maxVal !== null) { params.push(maxVal); conditions.push(`${col}::numeric > $${params.length}`); }

        const countRows = await srcSql.unsafe(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ${conditions.join(" OR ")})::int AS failed
          FROM ${tbl}
        `, params) as any[];

        const total  = Number(countRows[0]?.total  ?? 0);
        const failed = Number(countRows[0]?.failed ?? 0);
        const failurePct = total > 0 ? (failed / total) * 100 : 0;

        const badRows = await srcSql.unsafe(`
          SELECT COALESCE(${col}::text, '(null)') AS value, COUNT(*)::int AS cnt
          FROM ${tbl}
          WHERE ${conditions.join(" OR ")}
          GROUP BY ${col}::text
          ORDER BY cnt DESC
          LIMIT 20
        `, params) as any[];

        return {
          recordsScanned: total, recordsPassed: total - failed, recordsFailed: failed,
          failurePct,
          message: `Range [${minVal ?? "—"}, ${maxVal ?? "—"}] — ${failed} of ${total} values out of range or null`,
          samples: badRows.map((r: any) => ({ value: String(r.value), isValid: false, count: Number(r.cnt) })),
        };
      } finally {
        await srcSql.end();
      }
    }

    case "FRESHNESS_CHECK": {
      const maxAgeHours = Number(cfg.max_age_hours ?? 24);
      if (!meta.qualifiedTable || !meta.columnName) return simErr("Asset metadata missing");

      const srcSql = await getSourceSql(rule);
      if (!srcSql) return simErr("No source connection configured for this asset");

      try {
        const col = qi(meta.columnName);
        const tbl = meta.qualifiedTable;

        const countRows = await srcSql.unsafe(`
          SELECT
            COUNT(*)::int AS total,
            MAX(${col}::timestamp)::text AS latest,
            COUNT(*) FILTER (
              WHERE ${col} IS NULL
                 OR ${col}::timestamp < NOW() - ($1 || ' hours')::interval
            )::int AS failed
          FROM ${tbl}
        `, [String(maxAgeHours)]) as any[];

        const total   = Number(countRows[0]?.total ?? 0);
        const failed  = Number(countRows[0]?.failed ?? 0);
        const latest  = countRows[0]?.latest ?? "unknown";
        const failurePct = total > 0 ? (failed / total) * 100 : 0;

        return {
          recordsScanned: total, recordsPassed: total - failed, recordsFailed: failed,
          failurePct,
          message: `Latest: ${latest} — ${failed} of ${total} records older than ${maxAgeHours}h or null`,
        };
      } finally {
        await srcSql.end();
      }
    }

    case "REFERENTIAL_CHECK": {
      const refTable  = String(cfg.ref_table  ?? "");
      const refColumn = String(cfg.ref_column ?? "");
      if (!refTable || !refColumn) return simErr("Reference table and column are required");
      if (!meta.qualifiedTable || !meta.columnName) return simErr("Asset metadata missing");

      const srcSql = await getSourceSql(rule);
      if (!srcSql) return simErr("No source connection configured for this asset");

      try {
        const col    = qi(meta.columnName);
        const tbl    = meta.qualifiedTable;
        const refCol = qi(refColumn);
        // refTable comes from RefIntegrityPicker → "schema.table" or "table" — already trusted catalog data
        const refTbl = refTable.includes(".") ? refTable : qi(refTable);

        const countRows = await srcSql.unsafe(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE ${col} IS NULL
                 OR ${col}::text NOT IN (SELECT DISTINCT ${refCol}::text FROM ${refTbl} WHERE ${refCol} IS NOT NULL)
            )::int AS failed
          FROM ${tbl}
        `) as any[];

        const total  = Number(countRows[0]?.total  ?? 0);
        const failed = Number(countRows[0]?.failed ?? 0);
        const failurePct = total > 0 ? (failed / total) * 100 : 0;

        return {
          recordsScanned: total, recordsPassed: total - failed, recordsFailed: failed,
          failurePct,
          message: `FK: ${meta.columnName} → ${refTable}.${refColumn} — ${failed} of ${total} violations or null`,
        };
      } finally {
        await srcSql.end();
      }
    }

    case "CUSTOM_SQL": {
      const rawSql = rule.ruleDefinitionText;
      if (!rawSql?.trim()) return simErr("No SQL query configured");
      try {
        const rows = await sql.unsafe(rawSql) as any[];
        if (rows.length === 0) return simErr("Custom SQL returned no rows");
        const scanned = Number(rows[0].total_rows ?? 0);
        const failed  = Number(rows[0].failed_rows ?? 0);
        const failPct = scanned > 0 ? (failed / scanned) * 100 : 0;
        return {
          recordsScanned: scanned, recordsPassed: scanned - failed, recordsFailed: failed,
          failurePct: failPct, message: `Custom SQL: ${failed} of ${scanned} rows failed`,
        };
      } catch (err: unknown) {
        return simErr(err instanceof Error ? err.message : "SQL execution error");
      }
    }

    default:
      return simErr(`Unknown template: ${tpl}`);
  }
}

function simErr(msg: string): EngineResult {
  return { recordsScanned: null, recordsPassed: null, recordsFailed: null, failurePct: null, message: msg };
}

function determineStatus(rule: DqRule, failurePct: number | null, score: number | null): "PASSED" | "FAILED" | "WARNING" | "ERROR" {
  if (failurePct === null) return "ERROR";
  const threshold     = rule.thresholdFail;
  const warnThreshold = rule.thresholdWarn;
  if (threshold != null && score != null && score < threshold) return "FAILED";
  if (warnThreshold != null && score != null && score < warnThreshold) return "WARNING";
  return failurePct > 0 ? "FAILED" : "PASSED";
}
