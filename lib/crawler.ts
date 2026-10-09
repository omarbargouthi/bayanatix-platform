import postgres from "postgres";
import { objectTypeFromSourceTableType, type ObjectTypeCode } from "./object-types";
import { sql } from "./db";
import { openSecret } from "./secrets";
import { cleanSourcePath } from "./source-path";
import { maskStoredPersonalDataQuietly } from "./privacy/pi-housekeeping";
import { applyGovernanceDefaults } from "./queries/stakeholders";
import { logUpdate, logCreate } from "./audit";
import { startWorkflow } from "./workflow";
import { createNotification } from "./queries/notifications";
import { applySourceAttributes, type AttributeChange } from "./source-attributes";
import { applySourceBuiltinFields } from "./source-builtin-fields";

// Actor id used for audit_logs entries the crawler writes on its own (table-type
// suggestions). audit_logs.user_id has no FK constraint into bayanat.users, so this
// is safe as a plain marker string — same convention lib/dq-engine.ts already uses
// for automated asset_requests (raised_by_user_id = 'SYSTEM').
const SYSTEM_ACTOR = "SYSTEM";
type CrawlConfig = {
  schemaIncludeList:    string[] | null;
  schemaExcludeList:    string[];
  tableExcludePatterns: string[];
  profilingEnabled:     boolean;
  profilingMode:        string;
  profilingLimit:       number;
};

// ── Column / table / result types ────────────────────────────────────────────

type ColProfile = {
  nullCount:     number;
  nullPct:       number;
  distinctCount: number;
  minValue:      string | null;
  maxValue:      string | null;
  topValues:     { value: string; count: number }[];
};

type CrawlColumn = {
  name: string; dataType: string; isNullable: boolean;
  isPrimaryKey: boolean; isForeignKey: boolean; defaultValue: string | null;
  comment?: string | null;
  // SQL Server extended properties on this column (name -> value), for Custom Attribute source mappings.
  extProps?: Record<string, string>;
  profile?: ColProfile;
};

// objectType: what the source catalog says the object is (lib/object-types.ts).
// definition: a view's SQL as the source stores it (parsed by lib/lineage/view-anatomy.ts).
type CrawlTable  = { name: string; isView: boolean; objectType: ObjectTypeCode; definition?: { sql: string; dialect: "POSTGRES" | "MSSQL" | "ORACLE" | "MYSQL" } | null; columns: CrawlColumn[]; comment?: string | null; extProps?: Record<string, string>; rowCount?: number; sampleSize?: number };
type CrawlSchema = { name: string; tables: CrawlTable[] };

// FK topology harvested alongside columns — feeds bayanat.attribute_reference_links,
// the prerequisite the column-classifier's R3/R5/R6 rules need (see lib/column-classifier.ts).
export type CrawlFk = {
  schema: string; table: string; column: string;
  refSchema: string; refTable: string; refColumn: string;
  constraintName: string | null;
};

export type CrawlResult = {
  schemas:      CrawlSchema[];
  schemaCount:  number;
  tableCount:   number;
  columnCount:  number;
  foreignKeys:  CrawlFk[];
  profilingMode?:  string;
  profilingLimit?: number;
};

type ConnCfg = {
  connectionId: number; dbTypeCode: string; hostAddress: string; portNumber: number;
  databaseName: string | null; defaultSchema: string | null;
  usernameText: string | null; passwordText: string | null; sslEnabled: boolean;
};

// ── Table type classification ────────────────────────────────────────────────
// Suggests one of five table types from layout signals available right after a
// crawl (name, columns, row count) — no separate content-scanning pass needed.
// Deliberately a transparent, explainable rule scorer rather than a black box,
// since a steward has to be able to look at a suggestion and judge it. This is
// ALWAYS just a suggestion: saveCrawlResults() never overwrites a category a
// steward has already confirmed, however this function scores it.

export type CategoryCode = "MASTER" | "TRANSACTIONAL" | "REFERENCE" | "SETUP" | "SYSTEM";
export type ConfidenceCode = "HIGH" | "MEDIUM" | "LOW";

const CATEGORY_NAME_KEYWORDS: Record<CategoryCode, string[]> = {
  SYSTEM:       ["sys", "audit", "session", "queue", "cache", "migration", "job_log", "error_log", "index", "metadata"],
  SETUP:        ["config", "setting", "param", "role", "permission", "workflow_rule", "rule", "tax_rate", "preference", "policy", "feature_flag"],
  REFERENCE:    ["type", "status", "category", "code", "lookup", "reference", "currency", "unit", "country", "region", "language", "gender", "classification", "segment"],
  TRANSACTIONAL:["order", "invoice", "payment", "transaction", "shipment", "booking", "event", "activity", "receipt", "claim", "ticket", "interaction", "campaign_response"],
  MASTER:       ["customer", "product", "employee", "vendor", "supplier", "location", "user", "account", "item", "party", "organization", "asset", "member", "person"],
};

// Checked in this order so a more specific signal (e.g. an explicit "sys_"
// prefix) wins over a broader one (e.g. a generic "log" keyword elsewhere).
const CATEGORY_PRIORITY: CategoryCode[] = ["SYSTEM", "SETUP", "REFERENCE", "TRANSACTIONAL", "MASTER"];

const TIMESTAMP_COL_RE = /(_at|_on|_date|_time)$|^(date|time|timestamp|created|updated|modified)/i;
const FK_LIKE_COL_RE   = /(_id|_code|_fk)$/i;
const CODE_COL_RE      = /(^|_)code$/i;
const DESC_COL_RE      = /(name|desc|label|title)$/i;

function classifyTableType(schemaName: string, table: CrawlTable): { code: CategoryCode; confidence: ConfidenceCode } {
  const name = table.name.toLowerCase();
  const cols = table.columns.map(c => c.name.toLowerCase());
  const colCount = cols.length;
  const rowCount = table.rowCount;

  const score: Record<CategoryCode, number> = { MASTER: 0, TRANSACTIONAL: 0, REFERENCE: 0, SETUP: 0, SYSTEM: 0 };

  // Strongest signal: system schema/table naming conventions.
  if (/^(sys|pg_|information_schema)/i.test(schemaName) || /^(sys_|pg_)/i.test(name)) score.SYSTEM += 6;

  for (const category of CATEGORY_PRIORITY) {
    const hit = CATEGORY_NAME_KEYWORDS[category].some(kw => name.includes(kw));
    if (hit) score[category] += 4;
  }

  const timestampCols  = cols.filter(c => TIMESTAMP_COL_RE.test(c)).length;
  const fkLikeCols      = cols.filter(c => FK_LIKE_COL_RE.test(c) && !CODE_COL_RE.test(c)).length;
  const hasCodeDescPair = cols.some(c => CODE_COL_RE.test(c)) && cols.some(c => DESC_COL_RE.test(c));
  const isSmallStatic   = colCount > 0 && colCount <= 6 && (rowCount === undefined || rowCount < 500);
  const isLarge         = rowCount !== undefined && rowCount > 5000;

  if (timestampCols > 0)  score.TRANSACTIONAL += 2;
  if (fkLikeCols >= 2)    score.TRANSACTIONAL += 2;
  else if (fkLikeCols === 1) score.TRANSACTIONAL += 1;
  if (isLarge)             score.TRANSACTIONAL += 2;

  if (isSmallStatic && hasCodeDescPair) score.REFERENCE += 4;
  else if (isSmallStatic)               score.REFERENCE += 2;

  if (colCount >= 5 && !hasCodeDescPair && fkLikeCols <= 1) score.MASTER += 2;
  score.MASTER += 1; // weak tie-breaker: the most common default when nothing else stands out

  const ranked = CATEGORY_PRIORITY
    .map(code => ({ code, points: score[code] }))
    .sort((a, b) => b.points - a.points || CATEGORY_PRIORITY.indexOf(a.code) - CATEGORY_PRIORITY.indexOf(b.code));
  const [top, second] = ranked;
  const gap = top.points - (second?.points ?? 0);
  const confidence: ConfidenceCode = gap >= 4 ? "HIGH" : gap >= 2 ? "MEDIUM" : "LOW";

  return { code: top.code, confidence };
}

// ── Job logger ────────────────────────────────────────────────────────────────

type JobLogger = {
  jobId: number;
  info(msg: string): Promise<void>;
  warn(msg: string): Promise<void>;
  error(msg: string): Promise<void>;
};

async function makeJobLogger(connectionId: number, connectionName: string, triggeredByUserId: string | null): Promise<JobLogger> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.crawl_jobs (connection_id, connection_name, triggered_by_user_id)
    VALUES (${connectionId}, ${connectionName}, ${triggeredByUserId}) RETURNING job_id AS id
  `;
  const jobId = row.id;
  const log = async (level: string, msg: string) =>
    void sql`INSERT INTO bayanat.crawl_job_logs (job_id, level, message) VALUES (${jobId}, ${level}, ${msg})`
      .catch(() => {});
  return { jobId, info: m => log("INFO", m), warn: m => log("WARN", m), error: m => log("ERROR", m) };
}

// Best-effort — a notification failure must never fail the crawl it's
// reporting on. No triggeredByUserId (e.g. scripts/scheduler.mjs's own
// scheduled crawls) means no one to notify, not an error.
async function notifyCrawlFinished(
  connectionName: string, triggeredByUserId: string | null, status: "COMPLETED" | "FAILED", detail: string,
): Promise<void> {
  if (!triggeredByUserId) return;
  try {
    await createNotification({
      userId: triggeredByUserId,
      type: "JOB",
      title: status === "COMPLETED" ? `Crawl completed: ${connectionName}` : `Crawl failed: ${connectionName}`,
      body: detail,
      severity: status === "COMPLETED" ? "SUCCESS" : "ERROR",
      actionLabel: "View Job Details",
      actionHref: "/admin/audit-logs?tab=job-logs",
    });
  } catch (e) {
    console.error("[notifyCrawlFinished] failed to create notification", e);
  }
}

async function finishJob(jobId: number, result: CrawlResult, connectionName: string, triggeredByUserId: string | null): Promise<void> {
  await sql`UPDATE bayanat.crawl_jobs SET status='COMPLETED', finished_at=NOW(),
    schema_count=${result.schemaCount}, table_count=${result.tableCount},
    column_count=${result.columnCount} WHERE job_id=${jobId}`;
  await notifyCrawlFinished(connectionName, triggeredByUserId, "COMPLETED",
    `${result.schemaCount} schema(s), ${result.tableCount} table(s), ${result.columnCount} column(s).`);
}

async function failJob(jobId: number, errorText: string, connectionName: string, triggeredByUserId: string | null): Promise<void> {
  await sql`UPDATE bayanat.crawl_jobs SET status='FAILED', finished_at=NOW(),
    error_text=${errorText} WHERE job_id=${jobId}`;
  await notifyCrawlFinished(connectionName, triggeredByUserId, "FAILED", errorText);
}

// ── Schema / table filtering helpers ─────────────────────────────────────────

function schemaIncluded(name: string, cfg: CrawlConfig | null): boolean {
  if (!cfg) return true;
  if (cfg.schemaIncludeList?.length) return cfg.schemaIncludeList.includes(name);
  if (cfg.schemaExcludeList?.length) return !cfg.schemaExcludeList.includes(name);
  return true;
}

function tableIncluded(name: string, cfg: CrawlConfig | null): boolean {
  if (!cfg?.tableExcludePatterns?.length) return true;
  return !cfg.tableExcludePatterns.some(pat => likeMatch(name, pat));
}

function likeMatch(str: string, pattern: string): boolean {
  const re = new RegExp(
    "^" + pattern.split("").map(c =>
      c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    ).join("") + "$",
    "i",
  );
  return re.test(str);
}

// ── PostgreSQL profiling ──────────────────────────────────────────────────────

async function profilePostgresTable(
  pg: ReturnType<typeof postgres>,
  schema: string,
  table: string,
  columns: CrawlColumn[],
  mode: string,
  limit: number,
): Promise<{ rowCount: number; sampleSize: number; colProfiles: Map<string, ColProfile> }> {
  const qs = `"${schema.replace(/"/g, '""')}"."${table.replace(/"/g, '""')}"`;
  const sampleSrc =
    mode === "TOP_N"   ? `(SELECT * FROM ${qs} LIMIT ${limit})` :
    mode === "TOP_PCT" ? `(SELECT * FROM ${qs} TABLESAMPLE SYSTEM(${Math.min(100, Math.max(0.001, limit))}))` :
    qs;

  const [tc] = await pg.unsafe(`SELECT COUNT(*)::bigint AS n FROM ${qs}`);
  const rowCount = Number(tc.n);
  const [sc] = await pg.unsafe(`SELECT COUNT(*)::bigint AS n FROM ${sampleSrc} _s`);
  const sampleSize = Number(sc.n);

  const colProfiles = new Map<string, ColProfile>();

  for (const col of columns) {
    const qc = `"${col.name.replace(/"/g, '""')}"`;
    try {
      const [stat] = await pg.unsafe(`
        SELECT
          COUNT(*) FILTER (WHERE ${qc} IS NULL) AS null_count,
          COUNT(DISTINCT ${qc})                 AS distinct_count,
          MIN(${qc}::text)                      AS min_value,
          MAX(${qc}::text)                      AS max_value
        FROM ${sampleSrc} _s
      `);
      const topRows = await pg.unsafe(`
        SELECT ${qc}::text AS v, COUNT(*) AS c
        FROM ${sampleSrc} _s
        WHERE ${qc} IS NOT NULL
        GROUP BY ${qc} ORDER BY COUNT(*) DESC LIMIT 5
      `);
      const nullCount = Number(stat.null_count || 0);
      colProfiles.set(col.name, {
        nullCount,
        nullPct: sampleSize > 0 ? Math.round((nullCount / sampleSize) * 10000) / 100 : 0,
        distinctCount: Number(stat.distinct_count || 0),
        minValue: stat.min_value ?? null,
        maxValue: stat.max_value ?? null,
        topValues: (topRows as unknown as { v: string; c: string }[]).map(r => ({ value: r.v, count: Number(r.c) })),
      });
    } catch { /* skip column — unsupported type (geometry, bytea, etc.) */ }
  }

  return { rowCount, sampleSize, colProfiles };
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────

async function crawlPostgres(cfg: ConnCfg, config: CrawlConfig | null, logger: JobLogger): Promise<CrawlResult> {
  const pg = postgres({
    host: cfg.hostAddress, port: cfg.portNumber,
    database: cfg.databaseName || "postgres",
    username: cfg.usernameText || undefined,
    password: cfg.passwordText || undefined,
    ssl: cfg.sslEnabled ? "require" : false,
    max: 1, connect_timeout: 15, idle_timeout: 5,
  });
  try {
    const schemaRows = await pg<{ n: string }[]>`
      SELECT schema_name AS n FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
        AND schema_name NOT LIKE 'pg_temp_%' AND schema_name NOT LIKE 'pg_toast_temp_%'
      ORDER BY schema_name
    `;

    const schemas: CrawlSchema[] = [];
    const foreignKeys: CrawlFk[] = [];

    for (const sr of schemaRows) {
      if (!schemaIncluded(sr.n, config)) {
        await logger.info(`Skipping schema: ${sr.n} (excluded by config)`);
        continue;
      }
      await logger.info(`Crawling schema: ${sr.n}`);

      const tableRows = await pg<{ t: string; v: string }[]>`
        SELECT table_name AS t, table_type AS v FROM information_schema.tables
        WHERE table_schema = ${sr.n} ORDER BY table_name
      `;

      // FK harvest for the whole schema in one set-based query, via pg_constraint's
      // conkey/confkey arrays (unnest zipped by position) rather than the ANSI
      // information_schema views, which can't reliably pair columns on composite FKs.
      const fkRows = await pg<{ table: string; column: string; refSchema: string; refTable: string; refColumn: string; constraintName: string }[]>`
        SELECT
          cl.relname AS table, a.attname AS column,
          refns.nspname AS "refSchema", refcl.relname AS "refTable", refa.attname AS "refColumn",
          con.conname AS "constraintName"
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        JOIN pg_class refcl ON refcl.oid = con.confrelid
        JOIN pg_namespace refns ON refns.oid = refcl.relnamespace
        JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS cols(attnum, refattnum, ord) ON true
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = cols.attnum
        JOIN pg_attribute refa ON refa.attrelid = con.confrelid AND refa.attnum = cols.refattnum
        WHERE con.contype = 'f' AND ns.nspname = ${sr.n}
      `;
      const fkColsByTable = new Map<string, Set<string>>();
      for (const fk of fkRows) {
        foreignKeys.push({ schema: sr.n, table: fk.table, column: fk.column, refSchema: fk.refSchema, refTable: fk.refTable, refColumn: fk.refColumn, constraintName: fk.constraintName });
        const set = fkColsByTable.get(fk.table) ?? new Set<string>();
        set.add(fk.column);
        fkColsByTable.set(fk.table, set);
      }

      const tables: CrawlTable[] = [];
      for (const tr of tableRows) {
        if (!tableIncluded(tr.t, config)) continue;

        const pkRows = await pg<{ c: string }[]>`
          SELECT a.attname AS c FROM pg_index i
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          JOIN pg_class cl ON cl.oid = i.indrelid
          JOIN pg_namespace ns ON ns.oid = cl.relnamespace
          WHERE i.indisprimary AND ns.nspname = ${sr.n} AND cl.relname = ${tr.t}
        `;
        const pk = new Set(pkRows.map(r => r.c));
        const fkCols = fkColsByTable.get(tr.t) ?? new Set<string>();

        // Table comment + column comments in one query
        const [tCommentRow] = await pg<{ cmt: string | null }[]>`
          SELECT obj_description(c.oid, 'pg_class') AS cmt
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = ${sr.n} AND c.relname = ${tr.t}
        `;
        const colCommentRows = await pg<{ n: string; cmt: string | null }[]>`
          SELECT a.attname AS n, d.description AS cmt
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = a.attnum
          WHERE n.nspname = ${sr.n} AND c.relname = ${tr.t}
            AND a.attnum > 0 AND NOT a.attisdropped
        `;
        const colComments = new Map(colCommentRows.map(r => [r.n, r.cmt ?? null]));

        const cols = await pg<{ n: string; dt: string; nl: string; def: string | null }[]>`
          SELECT column_name AS n, data_type AS dt, is_nullable AS nl, column_default AS def
          FROM information_schema.columns
          WHERE table_schema = ${sr.n} AND table_name = ${tr.t} ORDER BY ordinal_position
        `;

        const columns: CrawlColumn[] = cols.map(c => ({
          name: c.n, dataType: c.dt,
          isNullable: c.nl === "YES", isPrimaryKey: pk.has(c.n), isForeignKey: fkCols.has(c.n), defaultValue: c.def,
          comment: colComments.get(c.n) ?? null,
        }));

        let rowCount: number | undefined;
        let sampleSize: number | undefined;

        if (config?.profilingEnabled && !tr.v.includes("VIEW")) {
          try {
            await logger.info(`  Profiling ${sr.n}.${tr.t}…`);
            const p = await profilePostgresTable(pg, sr.n, tr.t, columns, config.profilingMode, config.profilingLimit);
            rowCount   = p.rowCount;
            sampleSize = p.sampleSize;
            for (const col of columns) {
              const cp = p.colProfiles.get(col.name);
              if (cp) col.profile = cp;
            }
          } catch (e) {
            await logger.warn(`  Profiling failed for ${sr.n}.${tr.t}: ${(e as Error).message}`);
          }
        }

        let definition: CrawlTable["definition"] = null;
        if (tr.v === "VIEW") {
          try {
            const [d] = await pg<{ def: string | null }[]>`SELECT pg_get_viewdef(format('%I.%I', ${sr.n}::text, ${tr.t}::text)::regclass, true) AS def`;
            if (d?.def) definition = { sql: d.def, dialect: "POSTGRES" };
          } catch (e) { await logger.warn(`  View definition not readable for ${sr.n}.${tr.t}: ${(e as Error).message}`); }
        }
        tables.push({ name: tr.t, isView: tr.v === "VIEW", objectType: objectTypeFromSourceTableType(tr.v), definition, columns, comment: tCommentRow?.cmt ?? null, rowCount, sampleSize });
      }

      if (tables.length > 0) schemas.push({ name: sr.n, tables });
      await logger.info(`  → ${tables.length} tables/views in ${sr.n}`);
    }

    return {
      ...summarise(schemas, foreignKeys),
      profilingMode:  config?.profilingMode,
      profilingLimit: config?.profilingLimit,
    };
  } finally { await pg.end({ timeout: 5 }); }
}

// ── MySQL ─────────────────────────────────────────────────────────────────────

async function crawlMysql(cfg: ConnCfg, config: CrawlConfig | null, logger: JobLogger): Promise<CrawlResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mysql2: any;
  try { mysql2 = await import("mysql2/promise"); }
  catch { throw new Error("mysql2 driver not installed — run: npm install mysql2"); }

  const conn = await mysql2.createConnection({
    host: cfg.hostAddress, port: cfg.portNumber,
    database: cfg.databaseName || undefined,
    user: cfg.usernameText || undefined,
    password: cfg.passwordText || undefined,
    ssl: cfg.sslEnabled ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 15000,
  });
  try {
    const [dbRows] = await conn.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('information_schema','performance_schema','mysql','sys')
       ORDER BY schema_name`,
    );
    const schemas: CrawlSchema[] = [];
    const foreignKeys: CrawlFk[] = [];
    for (const dbRow of dbRows as Record<string, string>[]) {
      const sname = dbRow.schema_name || dbRow.SCHEMA_NAME;
      if (!schemaIncluded(sname, config)) continue;
      if (cfg.databaseName && sname !== cfg.databaseName) continue;

      await logger.info(`Crawling schema: ${sname}`);
      const [tRows] = await conn.query(
        `SELECT table_name, table_type, table_comment FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`, [sname],
      );

      // KEY_COLUMN_USAGE already pairs each FK column with its referenced column
      // (no composite-FK ambiguity, unlike Postgres' generic ANSI views).
      const [fkRows] = await conn.query(
        `SELECT table_name, column_name, referenced_table_schema, referenced_table_name, referenced_column_name, constraint_name
         FROM information_schema.key_column_usage
         WHERE table_schema = ? AND referenced_table_name IS NOT NULL`, [sname],
      );
      const fkColsByTable = new Map<string, Set<string>>();
      for (const fk of fkRows as Record<string, string>[]) {
        const table = fk.table_name || fk.TABLE_NAME;
        const column = fk.column_name || fk.COLUMN_NAME;
        foreignKeys.push({
          schema: sname, table, column,
          refSchema: fk.referenced_table_schema || fk.REFERENCED_TABLE_SCHEMA,
          refTable:  fk.referenced_table_name   || fk.REFERENCED_TABLE_NAME,
          refColumn: fk.referenced_column_name  || fk.REFERENCED_COLUMN_NAME,
          constraintName: fk.constraint_name    || fk.CONSTRAINT_NAME,
        });
        const set = fkColsByTable.get(table) ?? new Set<string>();
        set.add(column);
        fkColsByTable.set(table, set);
      }

      const tables: CrawlTable[] = [];
      for (const tRow of tRows as Record<string, string>[]) {
        const tname = tRow.table_name || tRow.TABLE_NAME;
        if (!tableIncluded(tname, config)) continue;
        const ttype = tRow.table_type || tRow.TABLE_TYPE;
        const tcomment = tRow.table_comment || tRow.TABLE_COMMENT || null;
        const fkCols = fkColsByTable.get(tname) ?? new Set<string>();
        const [cRows] = await conn.query(
          `SELECT column_name, data_type, is_nullable, column_default, column_key, column_comment
           FROM information_schema.columns
           WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`, [sname, tname],
        );
        let definition: CrawlTable["definition"] = null;
        if (ttype === "VIEW") {
          try {
            const [vRows] = await conn.query(`SELECT view_definition AS d FROM information_schema.views WHERE table_schema = ? AND table_name = ?`, [sname, tname]);
            const d = (vRows as Record<string, string>[])[0];
            const text = d?.d ?? d?.D ?? d?.VIEW_DEFINITION;
            if (text) definition = { sql: text, dialect: "MYSQL" };
          } catch (e) { await logger.warn(`  View definition not readable for ${sname}.${tname}: ${(e as Error).message}`); }
        }
        tables.push({
          name: tname, isView: ttype === "VIEW" || ttype === "SYSTEM VIEW", objectType: objectTypeFromSourceTableType(ttype), definition,
          comment: tcomment || null,
          columns: (cRows as Record<string, string>[]).map(c => ({
            name:         c.column_name    || c.COLUMN_NAME,
            dataType:     c.data_type      || c.DATA_TYPE,
            isNullable:   (c.is_nullable   || c.IS_NULLABLE) === "YES",
            isPrimaryKey: (c.column_key    || c.COLUMN_KEY)  === "PRI",
            isForeignKey: fkCols.has(c.column_name || c.COLUMN_NAME),
            defaultValue: c.column_default || c.COLUMN_DEFAULT || null,
            comment:      c.column_comment || c.COLUMN_COMMENT || null,
          })),
        });
      }
      if (tables.length > 0) schemas.push({ name: sname, tables });
      await logger.info(`  → ${tables.length} tables/views in ${sname}`);
    }
    return summarise(schemas, foreignKeys);
  } finally { await conn.end(); }
}

// ── SQL Server ────────────────────────────────────────────────────────────────

async function crawlMssql(cfg: ConnCfg, config: CrawlConfig | null, logger: JobLogger): Promise<CrawlResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mssql: any;
  try { mssql = await import("mssql"); }
  catch { throw new Error("mssql driver not installed — run: npm install mssql"); }

  const pool = await mssql.connect({
    server: cfg.hostAddress, port: cfg.portNumber,
    database: cfg.databaseName || undefined,
    user: cfg.usernameText || undefined, password: cfg.passwordText || undefined,
    options: { encrypt: cfg.sslEnabled, trustServerCertificate: !cfg.sslEnabled, connectTimeout: 15000 },
  });
  try {
    const SYS = new Set(["sys","INFORMATION_SCHEMA","guest","db_owner","db_accessadmin","db_securityadmin",
      "db_ddladmin","db_backupoperator","db_datareader","db_datawriter","db_denydatareader","db_denydatawriter"]);
    const sr = await pool.request().query(`SELECT name AS schema_name FROM sys.schemas ORDER BY name`);
    const schemas: CrawlSchema[] = [];
    const foreignKeys: CrawlFk[] = [];

    for (const row of sr.recordset) {
      const sname: string = row.schema_name;
      if (SYS.has(sname) || !schemaIncluded(sname, config)) continue;

      await logger.info(`Crawling schema: ${sname}`);
      const tr = await pool.request().input("s", mssql.VarChar, sname).query(`
        SELECT t.name AS table_name, 'BASE TABLE' AS table_type
        FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name=@s
        UNION ALL
        SELECT v.name,'VIEW' FROM sys.views v JOIN sys.schemas s ON v.schema_id=s.schema_id WHERE s.name=@s
        ORDER BY table_name`);

      // sys.foreign_key_columns already pairs each FK column with its referenced
      // column (parent_column_id <-> referenced_column_id), same dialect family
      // (sys.* catalog views) as the rest of this function's queries.
      const fkr = await pool.request().input("s", mssql.VarChar, sname).query(`
        SELECT t1.name AS table_name, c1.name AS column_name,
               s2.name AS ref_schema, t2.name AS ref_table, c2.name AS ref_column, fk.name AS constraint_name
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.tables t1 ON t1.object_id = fkc.parent_object_id
        JOIN sys.schemas s1 ON s1.schema_id = t1.schema_id
        JOIN sys.columns c1 ON c1.object_id = fkc.parent_object_id AND c1.column_id = fkc.parent_column_id
        JOIN sys.tables t2 ON t2.object_id = fkc.referenced_object_id
        JOIN sys.schemas s2 ON s2.schema_id = t2.schema_id
        JOIN sys.columns c2 ON c2.object_id = fkc.referenced_object_id AND c2.column_id = fkc.referenced_column_id
        WHERE s1.name = @s`);
      const fkColsByTable = new Map<string, Set<string>>();
      for (const fk of fkr.recordset as Record<string, string>[]) {
        foreignKeys.push({
          schema: sname, table: fk.table_name, column: fk.column_name,
          refSchema: fk.ref_schema, refTable: fk.ref_table, refColumn: fk.ref_column,
          constraintName: fk.constraint_name,
        });
        const set = fkColsByTable.get(fk.table_name) ?? new Set<string>();
        set.add(fk.column_name);
        fkColsByTable.set(fk.table_name, set);
      }

      // Every extended property on the schema's tables/columns in one query —
      // feeds Custom Attribute source mappings (lib/source-attributes.ts).
      const epr = await pool.request().input("s",mssql.VarChar,sname).query(`
        SELECT o.name AS t, c.name AS col, ep.name AS p, CAST(ep.value AS NVARCHAR(4000)) AS v
        FROM sys.extended_properties ep
        JOIN sys.objects o ON o.object_id = ep.major_id
        JOIN sys.schemas sc ON sc.schema_id = o.schema_id
        LEFT JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id AND ep.minor_id > 0
        WHERE ep.class = 1 AND sc.name = @s`);
      const tableProps = new Map<string, Record<string, string>>();
      const colProps = new Map<string, Record<string, string>>();
      for (const r of epr.recordset as { t: string; col: string | null; p: string; v: string | null }[]) {
        if (r.v == null) continue;
        const key = r.col ? `${r.t}|${r.col}` : r.t;
        const map = r.col ? colProps : tableProps;
        map.set(key, { ...(map.get(key) ?? {}), [r.p]: r.v });
      }

      const tables: CrawlTable[] = [];
      for (const trow of tr.recordset) {
        if (!tableIncluded(trow.table_name, config)) continue;
        const pkr = await pool.request().input("s",mssql.VarChar,sname).input("t",mssql.VarChar,trow.table_name).query(`
          SELECT col.name AS cn FROM sys.indexes i
          JOIN sys.index_columns ic ON i.object_id=ic.object_id AND i.index_id=ic.index_id
          JOIN sys.columns col ON col.object_id=ic.object_id AND col.column_id=ic.column_id
          JOIN sys.tables tb ON tb.object_id=i.object_id JOIN sys.schemas sc ON sc.schema_id=tb.schema_id
          WHERE i.is_primary_key=1 AND sc.name=@s AND tb.name=@t`);
        const pk = new Set(pkr.recordset.map((r: Record<string,string>) => r.cn));
        const fkCols = fkColsByTable.get(trow.table_name) ?? new Set<string>();
        const cr = await pool.request().input("s",mssql.VarChar,sname).input("t",mssql.VarChar,trow.table_name).query(`
          SELECT c.name AS cn, tp.name AS dt, c.is_nullable AS nl,
            CAST(ep.value AS NVARCHAR(MAX)) AS cmt
          FROM sys.columns c
          JOIN sys.tables tb ON tb.object_id=c.object_id
          JOIN sys.schemas sc ON sc.schema_id=tb.schema_id
          JOIN sys.types tp ON tp.user_type_id=c.user_type_id
          LEFT JOIN sys.extended_properties ep ON ep.major_id=c.object_id
            AND ep.minor_id=c.column_id AND ep.name='MS_Description'
          WHERE sc.name=@s AND tb.name=@t ORDER BY c.column_id`);
        const tcmt = await pool.request().input("s",mssql.VarChar,sname).input("t",mssql.VarChar,trow.table_name).query(`
          SELECT CAST(ep.value AS NVARCHAR(MAX)) AS cmt
          FROM sys.extended_properties ep
          JOIN sys.objects o ON o.object_id=ep.major_id
          JOIN sys.schemas sc ON sc.schema_id=o.schema_id
          WHERE ep.name='MS_Description' AND ep.minor_id=0 AND sc.name=@s AND o.name=@t`);
        let definition: CrawlTable["definition"] = null;
        if (trow.table_type === "VIEW") {
          try {
            const vd = await pool.request().input("s", mssql.VarChar, sname).input("t", mssql.VarChar, trow.table_name).query(`
              SELECT m.definition AS d FROM sys.sql_modules m
              JOIN sys.views v ON v.object_id = m.object_id JOIN sys.schemas sc ON sc.schema_id = v.schema_id
              WHERE sc.name = @s AND v.name = @t`);
            if (vd.recordset[0]?.d) definition = { sql: vd.recordset[0].d, dialect: "MSSQL" };
          } catch (e) { await logger.warn(`  View definition not readable for ${sname}.${trow.table_name}: ${(e as Error).message}`); }
        }
        tables.push({
          name: trow.table_name, isView: trow.table_type === "VIEW", objectType: objectTypeFromSourceTableType(trow.table_type), definition,
          comment: tcmt.recordset[0]?.cmt ?? null,
          extProps: tableProps.get(trow.table_name),
          columns: cr.recordset.map((c: Record<string, string|boolean|null>) => ({
            name: c.cn as string, dataType: c.dt as string,
            isNullable: !!c.nl, isPrimaryKey: pk.has(c.cn as string), isForeignKey: fkCols.has(c.cn as string), defaultValue: null,
            comment: c.cmt as string | null ?? null,
            extProps: colProps.get(`${trow.table_name}|${c.cn as string}`),
          })),
        });
      }
      if (tables.length > 0) schemas.push({ name: sname, tables });
      await logger.info(`  → ${tables.length} tables/views in ${sname}`);
    }
    return summarise(schemas, foreignKeys);
  } finally { await pool.close(); }
}

// ── CSV / Excel (flat files) ─────────────────────────────────────────────────
// Reuses the same schema→table→column catalog shape as database sources: a
// single file (or a directory of files) becomes one "schema" — named after
// the directory — and each CSV file, or each sheet within an Excel workbook,
// becomes one "table". Since flat files carry no declared column types,
// dataType is inferred by sampling each column's values (XLSX hands back real
// JS number/boolean/Date types under raw+cellDates mode, so this is a type
// check, not string parsing).

const FILE_EXTENSIONS: Record<string, string[]> = {
  CSV:   [".csv"],
  EXCEL: [".xlsx", ".xls", ".xlsm"],
  JSON:  [".json"],
};

// CSV carries no cell-type metadata at all — every value XLSX hands back for a
// .csv file is a plain string, even "12500" or "true". Excel workbooks do give
// back real JS number/boolean/Date values for typed cells, but a column can
// still mix genuinely-typed cells with text ones. So every value is classified
// by inspecting its actual JS type first, falling back to pattern-matching the
// string form — this handles both sources through one path. JSON adds a fourth
// possibility CSV/Excel cells never produce: a nested object or array value —
// classified as its own "json" kind rather than stringified and matched against
// the text patterns below.
type ValueKind = "int" | "num" | "bool" | "date" | "text" | "json" | "null";

function detectValueKind(raw: unknown): ValueKind {
  if (raw === null || raw === undefined) return "null";
  if (typeof raw === "number") return Number.isInteger(raw) ? "int" : "num";
  if (typeof raw === "boolean") return "bool";
  if (raw instanceof Date) return "date";
  if (typeof raw === "object") return "json";
  const s = String(raw).trim();
  if (s === "") return "null";
  if (/^(true|false)$/i.test(s)) return "bool";
  if (/^-?\d+$/.test(s)) return "int";
  if (/^-?\d+\.\d+$/.test(s)) return "num";
  if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(s) && !isNaN(Date.parse(s))) return "date";
  return "text";
}

function inferColumnsFromRows(headers: string[], rows: unknown[][]): { name: string; dataType: string; isNullable: boolean }[] {
  return headers.map((name, idx) => {
    let sawNull = false;
    const kinds = new Set<ValueKind>();
    for (const row of rows) {
      const kind = detectValueKind(row[idx]);
      if (kind === "null") { sawNull = true; continue; }
      kinds.add(kind);
    }
    let dataType = "text";
    if (kinds.size === 1) {
      const only = [...kinds][0];
      dataType = only === "int" ? "integer" : only === "num" ? "numeric" : only === "bool" ? "boolean" : only === "date" ? "date" : only === "json" ? "json" : "text";
    } else if (kinds.size > 0 && [...kinds].every(k => k === "int" || k === "num")) {
      dataType = "numeric"; // mixed whole numbers and decimals — numeric is the common supertype
    }
    return { name, dataType, isNullable: sawNull };
  });
}

function profileFileColumn(rows: unknown[][], idx: number, sampleSize: number): ColProfile {
  let nullCount = 0;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = row[idx];
    if (v === null || v === undefined || v === "") { nullCount++; continue; }
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "object" ? JSON.stringify(v) : String(v);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const sortedVals = [...counts.keys()].sort();
  const topValues = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => ({ value, count }));
  return {
    nullCount,
    nullPct: sampleSize > 0 ? Math.round((nullCount / sampleSize) * 10000) / 100 : 0,
    distinctCount: counts.size,
    minValue: sortedVals[0] ?? null,
    maxValue: sortedVals[sortedVals.length - 1] ?? null,
    topValues,
  };
}

// `rootPath` is stored in the connection's host_address field — file sources have
// no network host, so that column is repurposed to hold a file or directory path.
function listSourceFiles(fs: typeof import("node:fs"), path: typeof import("node:path"), rawPath: string, dbTypeCode: string): { files: string[]; schemaName: string } {
  const rootPath = cleanSourcePath(rawPath);
  if (!fs.existsSync(rootPath)) throw new Error(`Path not found: ${rootPath}`);
  const stat = fs.statSync(rootPath);
  const exts = FILE_EXTENSIONS[dbTypeCode] ?? [];

  if (stat.isDirectory()) {
    const files = fs.readdirSync(rootPath)
      .filter(f => exts.includes(path.extname(f).toLowerCase()))
      .map(f => path.join(rootPath, f))
      .sort();
    return { files, schemaName: path.basename(rootPath) || "files" };
  }
  if (stat.isFile()) {
    return { files: [rootPath], schemaName: path.basename(path.dirname(rootPath)) || "files" };
  }
  throw new Error(`Path is neither a file nor a directory: ${rootPath}`);
}

async function crawlFile(cfg: ConnCfg, config: CrawlConfig | null, logger: JobLogger): Promise<CrawlResult> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let XLSX: any;
  try { XLSX = await import("xlsx"); }
  catch { throw new Error("xlsx package not installed — run: npm install xlsx"); }

  if (!cfg.hostAddress) throw new Error("File or directory path is required");
  const { files, schemaName } = listSourceFiles(fs, path, cfg.hostAddress, cfg.dbTypeCode);
  await logger.info(`Found ${files.length} ${cfg.dbTypeCode} file(s) at ${cfg.hostAddress}`);

  if (!schemaIncluded(schemaName, config)) {
    await logger.info(`Skipping schema: ${schemaName} (excluded by config)`);
    return summarise([]);
  }

  const tables: CrawlTable[] = [];

  for (const filePath of files) {
    const fileBase = path.basename(filePath, path.extname(filePath));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let workbook: any;
    try {
      workbook = XLSX.readFile(filePath, { cellDates: true, raw: true });
    } catch (e) {
      await logger.warn(`  Failed to read ${filePath}: ${(e as Error).message}`);
      continue;
    }

    const multiSheet = workbook.SheetNames.length > 1;
    for (const sheetName of workbook.SheetNames as string[]) {
      const tableName = multiSheet ? `${fileBase}_${sheetName}` : fileBase;
      if (!tableIncluded(tableName, config)) continue;

      const sheet = workbook.Sheets[sheetName];
      const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
      // Excel-style CSV exports may start with a "sep=," line naming the delimiter — it
      // is not a header row.
      if (cfg.dbTypeCode === "CSV" && grid.length > 0) {
        const first = (grid[0] as unknown[]).filter((c) => c != null && String(c).trim() !== "");
        if (first.length === 1 && /^sep=.?$/i.test(String(first[0]).trim())) grid.shift();
      }
      if (grid.length === 0) { await logger.warn(`  ${tableName}: empty sheet, skipped`); continue; }

      const headers = (grid[0] as unknown[]).map((h, i) => (h == null || String(h).trim() === "") ? `column_${i + 1}` : String(h).trim());
      const dataRows = grid.slice(1);

      const inferred = inferColumnsFromRows(headers, dataRows);
      const columns: CrawlColumn[] = inferred.map(c => ({
        name: c.name, dataType: c.dataType, isNullable: c.isNullable,
        isPrimaryKey: false, isForeignKey: false, defaultValue: null, comment: null,
      }));

      let sampleSize: number | undefined;
      if (config?.profilingEnabled) {
        const limit = config.profilingMode === "FULL" ? dataRows.length
          : config.profilingMode === "TOP_PCT" ? Math.ceil(dataRows.length * (config.profilingLimit / 100))
          : Math.min(config.profilingLimit, dataRows.length);
        const sampleRows = dataRows.slice(0, limit);
        sampleSize = sampleRows.length;
        columns.forEach((col, idx) => { col.profile = profileFileColumn(sampleRows, idx, sampleSize!); });
      }

      tables.push({ name: tableName, isView: false, objectType: "FILE", columns, comment: null, rowCount: dataRows.length, sampleSize });
      await logger.info(`  → ${tableName}: ${columns.length} columns, ${dataRows.length} rows`);
    }
  }

  return summarise(tables.length > 0 ? [{ name: schemaName, tables }] : []);
}

// ── JSON ──────────────────────────────────────────────────────────────────────

function isArrayOfObjects(v: unknown): v is Record<string, unknown>[] {
  return Array.isArray(v) && v.length > 0 && v.every(x => x !== null && typeof x === "object" && !Array.isArray(x));
}

function unionKeys(records: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) keys.add(k);
  return [...keys];
}

// One JSON file can resolve to one or more tables:
//  - a top-level array of objects → one table, each element a row
//  - a top-level object whose values include array-of-object fields (e.g.
//    {"users":[...],"orders":[...]}, a common "nested export" shape) → one
//    table per such key, named "<fileBase>_<key>" — mirrors how a multi-sheet
//    Excel workbook becomes one table per sheet in crawlFile above
//  - anything else (a flat/nested single object, a bare array of scalars, or
//    a bare scalar) → one table with exactly one row, so the file is still
//    represented rather than silently skipped
function resolveJsonTables(fileBase: string, parsed: unknown): { tableName: string; records: Record<string, unknown>[] }[] {
  if (isArrayOfObjects(parsed)) {
    return [{ tableName: fileBase, records: parsed }];
  }
  if (Array.isArray(parsed)) {
    return [{ tableName: fileBase, records: parsed.map(v => ({ value: v })) }];
  }
  if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const arrayKeys = Object.keys(obj).filter(k => isArrayOfObjects(obj[k]));
    if (arrayKeys.length > 0) {
      return arrayKeys.map(k => ({ tableName: `${fileBase}_${k}`, records: obj[k] as Record<string, unknown>[] }));
    }
    return [{ tableName: fileBase, records: [obj] }];
  }
  return [{ tableName: fileBase, records: [{ value: parsed }] }];
}

async function crawlJson(cfg: ConnCfg, config: CrawlConfig | null, logger: JobLogger): Promise<CrawlResult> {
  const fs = await import("node:fs");
  const path = await import("node:path");

  if (!cfg.hostAddress) throw new Error("File or directory path is required");
  const { files, schemaName } = listSourceFiles(fs, path, cfg.hostAddress, cfg.dbTypeCode);
  await logger.info(`Found ${files.length} JSON file(s) at ${cfg.hostAddress}`);

  if (!schemaIncluded(schemaName, config)) {
    await logger.info(`Skipping schema: ${schemaName} (excluded by config)`);
    return summarise([]);
  }

  const tables: CrawlTable[] = [];

  for (const filePath of files) {
    const fileBase = path.basename(filePath, path.extname(filePath));
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      await logger.warn(`  Failed to read/parse ${filePath}: ${(e as Error).message}`);
      continue;
    }

    for (const { tableName, records } of resolveJsonTables(fileBase, parsed)) {
      if (!tableIncluded(tableName, config)) continue;
      if (records.length === 0) { await logger.warn(`  ${tableName}: no records, skipped`); continue; }

      const headers = unionKeys(records);
      const grid: unknown[][] = records.map(r => headers.map(h => r[h] ?? null));

      const inferred = inferColumnsFromRows(headers, grid);
      const columns: CrawlColumn[] = inferred.map(c => ({
        name: c.name, dataType: c.dataType, isNullable: c.isNullable,
        isPrimaryKey: false, isForeignKey: false, defaultValue: null, comment: null,
      }));

      let sampleSize: number | undefined;
      if (config?.profilingEnabled) {
        const limit = config.profilingMode === "FULL" ? grid.length
          : config.profilingMode === "TOP_PCT" ? Math.ceil(grid.length * (config.profilingLimit / 100))
          : Math.min(config.profilingLimit, grid.length);
        const sampleRows = grid.slice(0, limit);
        sampleSize = sampleRows.length;
        columns.forEach((col, idx) => { col.profile = profileFileColumn(sampleRows, idx, sampleSize!); });
      }

      tables.push({ name: tableName, isView: false, objectType: "FILE", columns, comment: null, rowCount: grid.length, sampleSize });
      await logger.info(`  → ${tableName}: ${columns.length} columns, ${grid.length} rows`);
    }
  }

  return summarise(tables.length > 0 ? [{ name: schemaName, tables }] : []);
}

// ── REST API (OpenAPI/Swagger) & SOAP API (WSDL) ─────────────────────────────
// Both are spec-driven, not live-sampled: we catalog the API's DECLARED shape
// (from its OpenAPI/WSDL document), never call the API's actual endpoints. This
// keeps the crawl safe (no outbound calls to business data, no auth scope beyond
// reading the spec itself) and fast, at the cost of the catalog only being as
// accurate/current as the published spec. `hostAddress` holds the spec's location
// — either a local file path or an http(s) URL; `usernameText`/`passwordText`
// (both optional, unlike every other file/spec type) are sent as HTTP Basic Auth
// when fetching a URL, for specs published behind auth.

async function fetchSpecText(cfg: ConnCfg): Promise<string> {
  const loc = cleanSourcePath(cfg.hostAddress ?? "");
  if (!loc) throw new Error("Spec file path or URL is required");
  if (/^https?:\/\//i.test(loc)) {
    const headers: Record<string, string> = {};
    if (cfg.usernameText) headers["Authorization"] = "Basic " + Buffer.from(`${cfg.usernameText}:${cfg.passwordText ?? ""}`).toString("base64");
    const res = await fetch(loc, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  }
  const fs = await import("node:fs");
  if (!fs.existsSync(loc)) throw new Error(`Path not found: ${loc}`);
  return fs.readFileSync(loc, "utf-8");
}

// ── OpenAPI / Swagger ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseOpenApiSpec(text: string): Promise<any> {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) return JSON.parse(text);
  const yaml = await import("js-yaml");
  return yaml.load(text);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractOpenApiSchemas(spec: any): Record<string, any> {
  return spec?.components?.schemas ?? spec?.definitions ?? {};
}

// Deliberately does not resolve/flatten $ref or nested object/array properties
// (same "type as json, don't deep-flatten" choice crawlJson makes) — a nested
// object property is typed "json" rather than expanded into its own table, since
// an OpenAPI schema property has no natural table identity of its own.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function openApiTypeToDataType(schema: any): string {
  if (!schema) return "text";
  if (schema.$ref) return "json";
  if (schema.type === "integer") return "integer";
  if (schema.type === "number") return "numeric";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "string" && (schema.format === "date" || schema.format === "date-time")) return "date";
  if (schema.type === "string") return "text";
  if (schema.type === "array" || schema.type === "object") return "json";
  return "text";
}

async function crawlRestApi(cfg: ConnCfg, config: CrawlConfig | null, logger: JobLogger): Promise<CrawlResult> {
  const text = await fetchSpecText(cfg);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let spec: any;
  try { spec = await parseOpenApiSpec(text); }
  catch (e) { throw new Error(`Failed to parse OpenAPI spec: ${(e as Error).message}`); }

  const schemaName = String(spec?.info?.title ?? "api").trim().replace(/\s+/g, "_").toLowerCase() || "api";
  await logger.info(`Parsed OpenAPI spec: ${spec?.info?.title ?? "(untitled)"} ${spec?.info?.version ?? ""}`.trim());
  if (!schemaIncluded(schemaName, config)) {
    await logger.info(`Skipping schema: ${schemaName} (excluded by config)`);
    return summarise([]);
  }

  const schemas = extractOpenApiSchemas(spec);
  const names = Object.keys(schemas);
  await logger.info(`Found ${names.length} schema object(s) in the spec`);
  if (names.length === 0) throw new Error("No component/definition schemas found in the OpenAPI spec — nothing to catalog");

  const tables: CrawlTable[] = [];
  for (const tableName of names) {
    if (!tableIncluded(tableName, config)) continue;
    const schema = schemas[tableName];
    const props = schema?.properties ?? {};
    const required = new Set<string>(schema?.required ?? []);
    const propNames = Object.keys(props);
    if (propNames.length === 0) { await logger.warn(`  ${tableName}: no properties, skipped`); continue; }

    const columns: CrawlColumn[] = propNames.map(name => ({
      name, dataType: openApiTypeToDataType(props[name]), isNullable: !required.has(name),
      isPrimaryKey: false, isForeignKey: false,
      defaultValue: props[name]?.default != null ? String(props[name].default) : null,
      comment: props[name]?.description ?? null,
    }));

    tables.push({ name: tableName, isView: false, objectType: "API_RESOURCE", columns, comment: schema?.description ?? null });
    await logger.info(`  → ${tableName}: ${columns.length} columns`);
  }

  return summarise(tables.length > 0 ? [{ name: schemaName, tables }] : []);
}

// ── SOAP / WSDL ───────────────────────────────────────────────────────────────
// WSDL's data shapes live in its embedded XSD <types> section as named
// complexTypes — everything else (portType/binding/service operations) describes
// the API surface, not its data model, so it's read only to name the schema.
// XML namespace prefixes for the XSD vocabulary vary by tool ("xsd:", "xs:", or
// none under a default namespace), so tags are matched by local name only.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function localKey(k: string): string { return k.includes(":") ? k.split(":").pop()! : k; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findAll(obj: any, tag: string): any[] {
  if (!obj || typeof obj !== "object") return [];
  const out: unknown[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (localKey(k) === tag) { if (Array.isArray(v)) out.push(...v); else out.push(v); }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findAllDeep(obj: any, tag: string): any[] {
  const out: unknown[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (localKey(k) === tag) { if (Array.isArray(v)) out.push(...v); else out.push(v); }
        walk(v);
      }
    }
  };
  walk(obj);
  return out;
}

// A repeating element (maxOccurs > 1 / "unbounded") has no single scalar shape,
// so — same "don't deep-flatten, type as json" choice as the array-field case in
// resolveJsonTables — it's typed "json" rather than spun into its own table.
function xsdTypeToDataType(type: string | undefined, maxOccurs: string | undefined): string {
  if (maxOccurs && (maxOccurs === "unbounded" || Number(maxOccurs) > 1)) return "json";
  const t = localKey(type ?? "").toLowerCase();
  if (["int", "integer", "long", "short", "byte", "unsignedint", "unsignedlong", "unsignedshort"].includes(t)) return "integer";
  if (["decimal", "double", "float"].includes(t)) return "numeric";
  if (t === "boolean") return "boolean";
  if (["date", "datetime", "time"].includes(t)) return "date";
  if (t === "string" || t === "") return "text";
  return "json"; // an inline/unrecognized complex type
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadWsdlComplexTypes(text: string): Promise<{ schemaName: string; complexTypes: any[] }> {
  const { XMLParser } = await import("fast-xml-parser");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", allowBooleanAttributes: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;
  try { doc = parser.parse(text); }
  catch (e) { throw new Error(`Failed to parse WSDL: ${(e as Error).message}`); }

  const defsKey = Object.keys(doc).find(k => localKey(k) === "definitions");
  const defs = defsKey ? doc[defsKey] : doc;
  const serviceNode = findAllDeep(defs, "service")[0];
  const schemaName = String(serviceNode?.name ?? "webservice").trim().replace(/\s+/g, "_").toLowerCase() || "webservice";
  const complexTypes = findAllDeep(defs, "complexType").filter(ct => ct?.name);
  return { schemaName, complexTypes };
}

async function crawlSoapApi(cfg: ConnCfg, config: CrawlConfig | null, logger: JobLogger): Promise<CrawlResult> {
  const text = await fetchSpecText(cfg);
  const { schemaName, complexTypes } = await loadWsdlComplexTypes(text);
  await logger.info(`Parsed WSDL: service "${schemaName}"`);

  if (!schemaIncluded(schemaName, config)) {
    await logger.info(`Skipping schema: ${schemaName} (excluded by config)`);
    return summarise([]);
  }

  await logger.info(`Found ${complexTypes.length} named complexType definition(s) in the WSDL`);
  if (complexTypes.length === 0) throw new Error("No named complexType definitions found in the WSDL's embedded schema — nothing to catalog");

  const tables: CrawlTable[] = [];
  for (const ct of complexTypes) {
    const tableName = String(ct.name);
    if (!tableIncluded(tableName, config)) continue;

    const elements = [...findAll(ct, "sequence"), ...findAll(ct, "all"), ...findAll(ct, "choice")]
      .flatMap(group => findAll(group, "element"))
      .filter(el => el?.name);
    if (elements.length === 0) { await logger.warn(`  ${tableName}: no elements, skipped`); continue; }

    const columns: CrawlColumn[] = elements.map(el => ({
      name: String(el.name), dataType: xsdTypeToDataType(el.type, el.maxOccurs != null ? String(el.maxOccurs) : undefined),
      isNullable: String(el.minOccurs) === "0",
      isPrimaryKey: false, isForeignKey: false,
      defaultValue: el.default != null ? String(el.default) : null, comment: null,
    }));

    tables.push({ name: tableName, isView: false, objectType: "API_RESOURCE", columns, comment: null });
    await logger.info(`  → ${tableName}: ${columns.length} columns`);
  }

  return summarise(tables.length > 0 ? [{ name: schemaName, tables }] : []);
}

// ── Oracle ────────────────────────────────────────────────────────────────────

async function crawlOracle(cfg: ConnCfg, config: CrawlConfig | null, logger: JobLogger): Promise<CrawlResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let oracledb: any;
  try { oracledb = await import(/* webpackIgnore: true */ "oracledb"); }
  catch { throw new Error("oracledb driver not installed — run: npm install oracledb (also requires Oracle Instant Client)"); }

  const conn = await oracledb.getConnection({
    user: cfg.usernameText || undefined,
    password: cfg.passwordText || undefined,
    connectString: `${cfg.hostAddress}:${cfg.portNumber}/${cfg.databaseName || "XE"}`,
  });
  try {
    const SYS = ["SYS","SYSTEM","OUTLN","DBSNMP","APPQOSSYS","ORDDATA","WMSYS","EXFSYS","CTXSYS","XDB"];
    const targetSchema = cfg.defaultSchema?.toUpperCase() || cfg.usernameText?.toUpperCase();
    const schemaFilter = targetSchema
      ? `AND owner = '${targetSchema.replace(/'/g,"''")}'`
      : `AND owner NOT IN (${SYS.map(s=>`'${s}'`).join(",")})`;

    const tabRes = await conn.execute(
      `SELECT owner,table_name,'BASE TABLE' AS ttype FROM all_tables t WHERE 1=1 ${schemaFilter}
         AND NOT EXISTS (SELECT 1 FROM all_mviews m WHERE m.owner = t.owner AND m.mview_name = t.table_name)
       UNION ALL SELECT owner,view_name,'VIEW' FROM all_views WHERE 1=1 ${schemaFilter}
       UNION ALL SELECT owner,mview_name,'MATERIALIZED VIEW' FROM all_mviews WHERE 1=1 ${schemaFilter} ORDER BY 1,2`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const schemaMap = new Map<string, CrawlTable[]>();
    const foreignKeys: CrawlFk[] = [];

    for (const row of (tabRes.rows || []) as Record<string, string>[]) {
      const owner = row.OWNER, tname = row.TABLE_NAME;
      if (!schemaIncluded(owner, config) || !tableIncluded(tname, config)) continue;
      if (!schemaMap.has(owner)) schemaMap.set(owner, []);
      const colRes = await conn.execute(
        `SELECT column_name,data_type,nullable FROM all_tab_columns WHERE owner=:o AND table_name=:t ORDER BY column_id`,
        { o: owner, t: tname }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const pkRes = await conn.execute(
        `SELECT cc.column_name FROM all_constraints c JOIN all_cons_columns cc ON cc.constraint_name=c.constraint_name AND cc.owner=c.owner WHERE c.owner=:o AND c.table_name=:t AND c.constraint_type='P'`,
        { o: owner, t: tname }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      // FK constraint (type 'R') joined to the constraint it references (r_owner/r_constraint_name),
      // pairing columns by `position` so composite FKs line up correctly.
      const fkRes = await conn.execute(
        `SELECT ac.constraint_name, acc.column_name, rac.owner AS ref_owner, rac.table_name AS ref_table, racc.column_name AS ref_column
         FROM all_constraints ac
         JOIN all_cons_columns acc ON acc.owner=ac.owner AND acc.constraint_name=ac.constraint_name
         JOIN all_constraints rac ON rac.owner=ac.r_owner AND rac.constraint_name=ac.r_constraint_name
         JOIN all_cons_columns racc ON racc.owner=rac.owner AND racc.constraint_name=rac.constraint_name AND racc.position=acc.position
         WHERE ac.constraint_type='R' AND ac.owner=:o AND ac.table_name=:t`,
        { o: owner, t: tname }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const tCommentRes = await conn.execute(
        `SELECT comments FROM all_tab_comments WHERE owner=:o AND table_name=:t`,
        { o: owner, t: tname }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const cCommentRes = await conn.execute(
        `SELECT column_name, comments FROM all_col_comments WHERE owner=:o AND table_name=:t`,
        { o: owner, t: tname }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const pk = new Set((pkRes.rows || []).map((r: Record<string,string>) => r.COLUMN_NAME));
      const fkCols = new Set<string>();
      for (const fk of (fkRes.rows || []) as Record<string, string>[]) {
        fkCols.add(fk.COLUMN_NAME);
        foreignKeys.push({
          schema: owner, table: tname, column: fk.COLUMN_NAME,
          refSchema: fk.REF_OWNER, refTable: fk.REF_TABLE, refColumn: fk.REF_COLUMN,
          constraintName: fk.CONSTRAINT_NAME,
        });
      }
      const colCmts = new Map(((cCommentRes.rows || []) as Record<string,string>[]).map(r => [r.COLUMN_NAME, r.COMMENTS ?? null]));
      let definition: CrawlTable["definition"] = null;
      if (row.TTYPE !== "BASE TABLE") {
        try {
          const vd = await conn.execute(
            row.TTYPE === "VIEW"
              ? `SELECT text AS d FROM all_views WHERE owner = :o AND view_name = :t`
              : `SELECT query AS d FROM all_mviews WHERE owner = :o AND mview_name = :t`,
            [owner, tname], { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );
          const d = ((vd.rows || []) as Record<string, string>[])[0]?.D;
          if (d) definition = { sql: d, dialect: "ORACLE" };
        } catch (e) { await logger.warn(`  View definition not readable for ${owner}.${tname}: ${(e as Error).message}`); }
      }
      schemaMap.get(owner)!.push({
        name: tname, isView: row.TTYPE !== "BASE TABLE", objectType: objectTypeFromSourceTableType(row.TTYPE), definition,
        comment: ((tCommentRes.rows || []) as Record<string,string>[])[0]?.COMMENTS ?? null,
        columns: (colRes.rows || []).map((c: Record<string, string>) => ({
          name: c.COLUMN_NAME, dataType: c.DATA_TYPE,
          isNullable: c.NULLABLE === "Y", isPrimaryKey: pk.has(c.COLUMN_NAME), isForeignKey: fkCols.has(c.COLUMN_NAME), defaultValue: null,
          comment: colCmts.get(c.COLUMN_NAME) ?? null,
        })),
      });
    }
    for (const [schema] of schemaMap) await logger.info(`Crawled schema: ${schema}`);
    return summarise(Array.from(schemaMap.entries()).map(([name, tables]) => ({ name, tables })), foreignKeys);
  } finally { await conn.close(); }
}

// ── Summarise ─────────────────────────────────────────────────────────────────

function summarise(schemas: CrawlSchema[], foreignKeys: CrawlFk[] = []): CrawlResult {
  const tableCount  = schemas.reduce((s, sc) => s + sc.tables.length, 0);
  const columnCount = schemas.reduce((s, sc) => s + sc.tables.reduce((t, tb) => t + tb.columns.length, 0), 0);
  return { schemas, schemaCount: schemas.length, tableCount, columnCount, foreignKeys };
}

// ── Test connection ───────────────────────────────────────────────────────────

export async function testConnection(connectionId: number): Promise<{ ok: boolean; message: string }> {
  const [cfg] = await sql<ConnCfg[]>`
    SELECT db_type_code AS "dbTypeCode", host_address AS "hostAddress", port_number AS "portNumber",
           database_name AS "databaseName", username_text AS "usernameText", password_text AS "passwordText",
           coalesce(ssl_enabled,false) AS "sslEnabled"
    FROM bayanat.connection_registry WHERE connection_id = ${connectionId}
  `;
  if (!cfg) throw new Error("Connection not found");
  cfg.passwordText = openSecret(cfg.passwordText);

  try {
    if (cfg.dbTypeCode === "POSTGRES") {
      const pg = postgres({
        host: cfg.hostAddress, port: cfg.portNumber,
        database: cfg.databaseName || "postgres",
        username: cfg.usernameText || undefined, password: cfg.passwordText || undefined,
        ssl: cfg.sslEnabled ? "require" : false,
        max: 1, connect_timeout: 10, idle_timeout: 5,
      });
      const [v] = await pg<{ v: string }[]>`SELECT version() AS v`;
      await pg.end({ timeout: 5 });
      return { ok: true, message: v.v.split(",")[0] };
    }
    if (cfg.dbTypeCode === "MYSQL") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m2 = await import("mysql2/promise") as any;
      const c = await m2.createConnection({
        host: cfg.hostAddress, port: cfg.portNumber,
        user: cfg.usernameText || undefined, password: cfg.passwordText || undefined,
        database: cfg.databaseName || undefined,
        ssl: cfg.sslEnabled ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 10000,
      });
      const [rows] = await c.query("SELECT VERSION() AS v");
      await c.end();
      return { ok: true, message: `MySQL ${(rows as Record<string,string>[])[0].v}` };
    }
    if (cfg.dbTypeCode === "MSSQL") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ms = await import("mssql") as any;
      const pool = await ms.connect({
        server: cfg.hostAddress, port: cfg.portNumber,
        user: cfg.usernameText || undefined, password: cfg.passwordText || undefined,
        database: cfg.databaseName || undefined,
        options: { encrypt: cfg.sslEnabled, trustServerCertificate: !cfg.sslEnabled, connectTimeout: 10000 },
      });
      const r = await pool.request().query("SELECT @@VERSION AS v");
      await pool.close();
      return { ok: true, message: `SQL Server ${(r.recordset[0].v as string).split("\n")[0].trim()}` };
    }
    if (cfg.dbTypeCode === "ORACLE") {
      return { ok: false, message: "Oracle: install oracledb native driver (npm install oracledb) + Oracle Instant Client" };
    }
    if (cfg.dbTypeCode === "CSV" || cfg.dbTypeCode === "EXCEL" || cfg.dbTypeCode === "JSON") {
      const fs = await import("node:fs");
      const path = await import("node:path");
      if (!cfg.hostAddress) return { ok: false, message: "File or directory path is required" };
      const { files } = listSourceFiles(fs, path, cfg.hostAddress, cfg.dbTypeCode);
      const extLabel = cfg.dbTypeCode === "CSV" ? ".csv" : cfg.dbTypeCode === "JSON" ? ".json" : ".xlsx/.xls";
      return files.length > 0
        ? { ok: true, message: `Found ${files.length} ${cfg.dbTypeCode} file(s)` }
        : { ok: false, message: `No ${extLabel} files found at that path` };
    }
    if (cfg.dbTypeCode === "PBIX_FOLDER") {
      const { listPbixFiles } = await import("./lineage/pbix-folder-scan");
      const { files } = listPbixFiles(cfg.hostAddress ?? "");
      return files.length > 0
        ? { ok: true, message: `Found ${files.length} .pbix file(s)` }
        : { ok: false, message: "No .pbix files found at that path" };
    }
    if (cfg.dbTypeCode === "REST_API") {
      const text = await fetchSpecText(cfg);
      const spec = await parseOpenApiSpec(text);
      const count = Object.keys(extractOpenApiSchemas(spec)).length;
      return count > 0
        ? { ok: true, message: `OpenAPI spec parsed — ${count} schema object(s) found` }
        : { ok: false, message: "OpenAPI spec parsed, but no component/definition schemas were found" };
    }
    if (cfg.dbTypeCode === "SOAP_API") {
      const text = await fetchSpecText(cfg);
      const { schemaName, complexTypes } = await loadWsdlComplexTypes(text);
      return complexTypes.length > 0
        ? { ok: true, message: `WSDL parsed — service "${schemaName}", ${complexTypes.length} complexType(s) found` }
        : { ok: false, message: "WSDL parsed, but no named complexType definitions were found" };
    }
    return { ok: false, message: `Unknown DB type: ${cfg.dbTypeCode}` };
  } catch (e: unknown) {
    return { ok: false, message: (e as Error).message };
  }
}

// ── Save crawl results to catalog ─────────────────────────────────────────────

type GovernanceDefaults = {
  defaultOwnerUserId:   string | null;
  defaultBizStewardId:  string | null;
  defaultTechStewardId: string | null;
};

// One entry per table that had ANY change this crawl (new, modified/added/removed
// columns, or the table itself appeared/disappeared) — bundled per-table (not
// per-column) so a table's steward(s) get one review item covering everything,
// not a flood. Populated only when !isFirstCrawl (see saveCrawlResults).
type ColumnRef = { id: number; name: string; oldValue?: string | null; newValue?: string | null };
export type EntityChange = {
  entityId:        number;
  entityName:      string;
  schemaId:        number;
  isNewEntity:     boolean;
  isRemovedEntity: boolean;
  addedColumns:    ColumnRef[];
  modifiedColumns: ColumnRef[];
  removedColumns:  ColumnRef[];
  // Custom Attribute values that changed because the source changed them (lib/source-attributes.ts).
  attributeChanges?: AttributeChange[];
};

function hasAnyChange(c: EntityChange): boolean {
  return c.isNewEntity || c.isRemovedEntity
    || c.addedColumns.length > 0 || c.modifiedColumns.length > 0 || c.removedColumns.length > 0
    || (c.attributeChanges?.length ?? 0) > 0;
}

// Non-destructive, idempotent sync (find-or-create + update-in-place, matched by name),
// mirroring the same pattern already used by the lineage scanner's ensureSchema/ensureEntity/
// ensureAttribute. A prior version deleted-and-recreated the whole schema/entity/attribute
// tree on every crawl, which is simple but breaks the moment any other module (DSA datasets,
// lineage edges, Open Data columns, DQ rules, ...) holds a foreign key into data_entities —
// the DELETE aborts with an FK violation and the entire crawl fails. Preserving row identity
// across re-crawls avoids that class of failure entirely.
async function saveCrawlResults(
  connectionId: number, connectionName: string, dbTypeCode: string,
  hostAddress: string, databaseName: string | null,
  result: CrawlResult, jobId: number,
  govDefaults: GovernanceDefaults,
): Promise<{ sourceId: number; isFirstCrawl: boolean; changes: EntityChange[] }> {
  const existing = await sql<{ id: number }[]>`
    SELECT data_source_id AS id FROM bayanat.data_sources WHERE connection_id = ${connectionId}
  `;
  // No prior data_sources row for this connection = nothing to diff against.
  // Skipping change-tracking here isn't just an optimization: nobody could be
  // following/stewarding a source that didn't exist yet, so there's no
  // audience for "new" notifications on an initial import of hundreds of tables.
  const isFirstCrawl = existing.length === 0;
  const changes = new Map<number, EntityChange>();
  function recordChange(entityId: number, entityName: string, schemaId: number): EntityChange {
    let c = changes.get(entityId);
    if (!c) {
      c = { entityId, entityName, schemaId, isNewEntity: false, isRemovedEntity: false, addedColumns: [], modifiedColumns: [], removedColumns: [] };
      changes.set(entityId, c);
    }
    return c;
  }
  let sourceId: number;
  const prevCounts = new Map<string, number | null>();
  if (existing.length > 0) {
    sourceId = existing[0].id;
    const snapRows = await sql<{ name: string; cnt: string | null }[]>`
      SELECT e.entity_name_text AS name, e.row_count_estimate::text AS cnt
      FROM bayanat.data_entities e
      JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE s.data_source_id = ${sourceId}
    `;
    for (const r of snapRows) prevCounts.set(r.name, r.cnt != null ? Number(r.cnt) : null);
  } else {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO bayanat.data_sources
        (source_name_text, source_type_code, host_address_text, database_name_text, connection_id)
      VALUES (${connectionName}, ${dbTypeCode}, ${hostAddress}, ${databaseName || ""}, ${connectionId})
      RETURNING data_source_id AS id
    `;
    sourceId = row.id;
  }

  // Governance defaults are applied once, here, at the source itself — the
  // column -> table -> schema -> source resolver inherits them down to every
  // schema/table/column discovered under it (see lib/queries/stakeholders.ts).
  void applyGovernanceDefaults(
    "DATA_SOURCES", sourceId,
    govDefaults.defaultOwnerUserId,
    govDefaults.defaultBizStewardId,
    govDefaults.defaultTechStewardId,
  ).catch(() => {});

  const touchedSchemaIds: number[] = [];
  const touchedEntityIds: number[] = [];
  const touchedAttributeIds: number[] = [];

  for (const schema of result.schemas) {
    const [existingSchema] = await sql<{ id: number }[]>`
      SELECT schema_id AS id FROM bayanat.data_schemas WHERE data_source_id = ${sourceId} AND schema_name_text = ${schema.name}
    `;
    const schemaId = existingSchema
      ? existingSchema.id
      : (await sql<{ id: number }[]>`
          INSERT INTO bayanat.data_schemas (data_source_id, schema_name_text)
          VALUES (${sourceId}, ${schema.name}) RETURNING schema_id AS id
        `)[0].id;
    touchedSchemaIds.push(schemaId);

    for (const table of schema.tables) {
      const [existingEntity] = await sql<{
        id: number; suggestedCategory: string | null; category: string | null; isConfirmed: boolean;
        lifecycleStatus: string;
      }[]>`
        SELECT entity_id AS id, suggested_category_code AS "suggestedCategory",
               entity_category_code AS category, coalesce(category_is_confirmed, false) AS "isConfirmed",
               lifecycle_status_code AS "lifecycleStatus"
        FROM bayanat.data_entities WHERE schema_id = ${schemaId} AND entity_name_text = ${table.name}
      `;
      const suggestion = classifyTableType(schema.name, table);
      let entityId: number;
      if (existingEntity) {
        entityId = existingEntity.id;
        const wasDeprecated = existingEntity.lifecycleStatus === "DEPRECATED";
        await sql`
          UPDATE bayanat.data_entities SET
            is_view_indicator = ${table.isView},
            object_type_code = ${table.objectType},
            view_definition_text = ${table.definition?.sql ?? null},
            view_definition_dialect = ${table.definition?.dialect ?? null},
            view_definition_captured_at = ${table.definition ? sql`now()` : null},
            source_description_text = ${table.comment ?? null},
            suggested_category_code = ${suggestion.code},
            category_confidence_code = ${suggestion.confidence},
            entity_category_code = CASE WHEN category_is_confirmed THEN entity_category_code ELSE ${suggestion.code} END,
            lifecycle_status_code = 'ACTIVE',
            deprecated_at_timestamp = NULL
          WHERE entity_id = ${entityId}
        `;
        // Only worth a history entry when the model's opinion actually moved (re-crawls
        // with no layout change would otherwise write an identical row every time).
        // Attributed to SYSTEM so it reads distinctly from a steward's own decisions.
        if (suggestion.code !== existingEntity.suggestedCategory) {
          const entChanges: Parameters<typeof logUpdate>[3] = [
            { field: "suggested_category_code", oldVal: existingEntity.suggestedCategory, newVal: suggestion.code },
          ];
          if (!existingEntity.isConfirmed && suggestion.code !== existingEntity.category) {
            entChanges.push({ field: "entity_category_code", oldVal: existingEntity.category, newVal: suggestion.code });
          }
          await logUpdate("DATA_ENTITIES", entityId, SYSTEM_ACTOR, entChanges);
        }
        // A table that reappears after being soft-deleted is treated as
        // rediscovered, not a silent no-op — worth surfacing again.
        if (wasDeprecated) recordChange(entityId, table.name, schemaId).isNewEntity = true;
      } else {
        entityId = (await sql<{ id: number }[]>`
          INSERT INTO bayanat.data_entities
            (schema_id, entity_name_text, display_name_text, is_view_indicator, object_type_code,
             view_definition_text, view_definition_dialect, view_definition_captured_at, source_description_text,
             entity_category_code, suggested_category_code, category_confidence_code, category_is_confirmed)
          VALUES (${schemaId}, ${table.name}, ${table.name}, ${table.isView}, ${table.objectType},
                  ${table.definition?.sql ?? null}, ${table.definition?.dialect ?? null}, ${table.definition ? sql`now()` : null}, ${table.comment ?? null},
                  ${suggestion.code}, ${suggestion.code}, ${suggestion.confidence}, false)
          RETURNING entity_id AS id
        `)[0].id;
        await logUpdate("DATA_ENTITIES", entityId, SYSTEM_ACTOR, [
          { field: "suggested_category_code", oldVal: null, newVal: suggestion.code },
          { field: "entity_category_code", oldVal: null, newVal: suggestion.code },
        ]);
        recordChange(entityId, table.name, schemaId).isNewEntity = true;
      }
      touchedEntityIds.push(entityId);

      // Save profiling metadata if collected
      let profileId: number | null = null;
      if (table.rowCount !== undefined) {
        const prevRowCount = prevCounts.get(table.name) ?? null;
        await sql`
          UPDATE bayanat.data_entities SET row_count_estimate = ${table.rowCount}
          WHERE entity_id = ${entityId}
        `;
        const [profRow] = await sql<{ id: number }[]>`
          INSERT INTO bayanat.entity_profile
            (entity_id, job_id, row_count, prev_row_count, sample_size, profiling_mode, profiling_limit)
          VALUES (
            ${entityId}, ${jobId}, ${table.rowCount}, ${prevRowCount},
            ${table.sampleSize ?? null},
            ${result.profilingMode ?? null}, ${result.profilingLimit ?? null}
          ) RETURNING profile_id AS id
        `;
        profileId = profRow.id;
      }

      for (const col of table.columns) {
        const [existingAttr] = await sql<{ id: number; dataType: string; lifecycleStatus: string }[]>`
          SELECT attribute_id AS id, data_type_text AS "dataType", lifecycle_status_code AS "lifecycleStatus"
          FROM bayanat.data_attributes WHERE entity_id = ${entityId} AND physical_name_text = ${col.name}
        `;
        let attributeId: number;
        if (existingAttr) {
          attributeId = existingAttr.id;
          const wasDeprecated = existingAttr.lifecycleStatus === "DEPRECATED";
          if (wasDeprecated) {
            recordChange(entityId, table.name, schemaId).addedColumns.push({ id: attributeId, name: col.name });
          } else if (existingAttr.dataType !== col.dataType) {
            // Deliberately narrow "modified" signal — just the physical type,
            // not description/friendly-name which regenerate often and would
            // create noise disproportionate to the review this triggers.
            recordChange(entityId, table.name, schemaId).modifiedColumns.push({
              id: attributeId, name: col.name, oldValue: existingAttr.dataType, newValue: col.dataType,
            });
          }
          await sql`
            UPDATE bayanat.data_attributes SET
              data_type_text = ${col.dataType},
              is_nullable_indicator = ${col.isNullable},
              is_primary_key_indicator = ${col.isPrimaryKey},
              is_foreign_key_indicator = ${col.isForeignKey},
              default_value_text = ${col.defaultValue},
              source_description_text = ${col.comment ?? null},
              lifecycle_status_code = 'ACTIVE',
              deprecated_at_timestamp = NULL
            WHERE attribute_id = ${attributeId}
          `;
        } else {
          attributeId = (await sql<{ id: number }[]>`
            INSERT INTO bayanat.data_attributes
              (entity_id, physical_name_text, friendly_name_text, data_type_text,
               is_nullable_indicator, is_primary_key_indicator, is_foreign_key_indicator,
               default_value_text, source_description_text)
            VALUES (${entityId}, ${col.name}, ${col.name}, ${col.dataType}, ${col.isNullable}, ${col.isPrimaryKey},
                    ${col.isForeignKey}, ${col.defaultValue}, ${col.comment ?? null})
            RETURNING attribute_id AS id
          `)[0].id;
          recordChange(entityId, table.name, schemaId).addedColumns.push({ id: attributeId, name: col.name });
        }
        touchedAttributeIds.push(attributeId);

        if (profileId && col.profile) {
          await sql`
            INSERT INTO bayanat.attribute_profile
              (profile_id, attribute_id, null_count, null_pct, distinct_count,
               min_value, max_value, top_values)
            VALUES (
              ${profileId}, ${attributeId},
              ${col.profile.nullCount}, ${col.profile.nullPct}, ${col.profile.distinctCount},
              ${col.profile.minValue}, ${col.profile.maxValue},
              ${JSON.stringify(col.profile.topValues)}::jsonb
            )
            ON CONFLICT (profile_id, attribute_id) DO NOTHING
          `;
        }
      }
    }
  }

  // Columns/tables that existed from a previous crawl of this source but weren't
  // found this time (dropped or renamed at the source) are soft-deleted — flagged
  // DEPRECATED rather than removed — so they stay available for reference/history
  // and anything referencing them (DQ rules, DSA columns, past requests, lineage
  // edges, Open Data columns, ...) keeps working. Only rows still ACTIVE are
  // touched, so an already-deprecated row from an earlier rescan isn't re-flagged
  // (and doesn't get re-notified) every time.
  const staleAttrs = await sql<{ id: number; physicalName: string; entityId: number; entityName: string; schemaId: number }[]>`
    SELECT a.attribute_id AS id, a.physical_name_text AS "physicalName",
           a.entity_id AS "entityId", e.entity_name_text AS "entityName", e.schema_id AS "schemaId"
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE s.data_source_id = ${sourceId}
      AND a.lifecycle_status_code = 'ACTIVE'
      AND a.attribute_id != ALL(${touchedAttributeIds.length > 0 ? touchedAttributeIds : [-1]})
  `;
  if (staleAttrs.length > 0) {
    await sql`
      UPDATE bayanat.data_attributes SET lifecycle_status_code = 'DEPRECATED', deprecated_at_timestamp = NOW()
      WHERE attribute_id = ANY(${staleAttrs.map((r) => r.id)})
    `;
    for (const row of staleAttrs) {
      // Only record against entities that are themselves still active this crawl —
      // an entity that's ALSO gone gets its own isRemovedEntity record below instead,
      // rather than double-reporting every one of its columns too.
      if (touchedEntityIds.includes(row.entityId)) {
        recordChange(row.entityId, row.entityName, row.schemaId).removedColumns.push({ id: row.id, name: row.physicalName });
      }
    }
  }

  const staleEntities = await sql<{ id: number; entityName: string; schemaId: number }[]>`
    SELECT e.entity_id AS id, e.entity_name_text AS "entityName", e.schema_id AS "schemaId"
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE s.data_source_id = ${sourceId}
      AND e.lifecycle_status_code = 'ACTIVE'
      AND e.entity_id != ALL(${touchedEntityIds.length > 0 ? touchedEntityIds : [-1]})
  `;
  if (staleEntities.length > 0) {
    await sql`
      UPDATE bayanat.data_entities SET lifecycle_status_code = 'DEPRECATED', deprecated_at_timestamp = NOW()
      WHERE entity_id = ANY(${staleEntities.map((r) => r.id)})
    `;
    for (const row of staleEntities) {
      recordChange(row.id, row.entityName, row.schemaId).isRemovedEntity = true;
    }
  }

  // Schema-level removal deliberately keeps today's hard-delete-cascade behavior —
  // a whole schema vanishing from a live source is rare, and cascading through
  // already-deprecated child rows here is a known, accepted limitation (not
  // silently swallowed — see db/117's migration header).
  const staleSchemas = await sql<{ id: number }[]>`
    SELECT schema_id AS id FROM bayanat.data_schemas
    WHERE data_source_id = ${sourceId}
      AND schema_id != ALL(${touchedSchemaIds.length > 0 ? touchedSchemaIds : [-1]})
  `;
  for (const row of staleSchemas) {
    try { await sql`DELETE FROM bayanat.data_schemas WHERE schema_id = ${row.id}`; }
    catch { /* still has entities that couldn't be removed — left as stale */ }
  }

  return { sourceId, isFirstCrawl, changes: [...changes.values()].filter(hasAnyChange) };
}

// Turns a rescan's collected EntityChange list into (a) an audit-log trail so
// anyone following the table/schema/source sees it in their Homepage Followed
// Activity feed, and (b) — only if an admin has actually mapped a workflow to
// METADATA_UPDATE via /admin/workflows (an unmapped request type is a no-op in
// startWorkflow(), which is exactly "the workflow is not enabled") — one
// asset_requests row per changed table, routed to its steward(s)
// (Owner/Business Steward/Technical Steward, via the new ASSET_STEWARD
// assignee type in lib/workflow.ts) for review. Never called on a source's
// first crawl — see saveCrawlResults.
async function processEntityChanges(changes: EntityChange[], isFirstCrawl: boolean): Promise<void> {
  if (isFirstCrawl) return;

  for (const c of changes) {
    // New-entity creation already gets its own audit_logs entry (see the
    // suggested_category_code logUpdate call above, unconditional and
    // pre-existing) — don't duplicate it here. Column-level add/modify/remove
    // and whole-table removal have no existing audit trail, so add one.
    if (!c.isNewEntity) {
      for (const col of c.addedColumns) {
        await logCreate("DATA_ATTRIBUTES", col.id, SYSTEM_ACTOR, [{ field: "physical_name_text", newVal: col.name }]);
      }
      for (const col of c.modifiedColumns) {
        await logUpdate("DATA_ATTRIBUTES", col.id, SYSTEM_ACTOR, [{ field: "data_type_text", oldVal: col.oldValue ?? null, newVal: col.newValue ?? null }]);
      }
      for (const col of c.removedColumns) {
        await logUpdate("DATA_ATTRIBUTES", col.id, SYSTEM_ACTOR, [{ field: "lifecycle_status_code", oldVal: "ACTIVE", newVal: "DEPRECATED" }]);
      }
    }
    if (c.isRemovedEntity) {
      await logUpdate("DATA_ENTITIES", c.entityId, SYSTEM_ACTOR, [{ field: "lifecycle_status_code", oldVal: "ACTIVE", newVal: "DEPRECATED" }]);
    }

    const schemaChanged = c.addedColumns.length > 0 || c.modifiedColumns.length > 0 || c.removedColumns.length > 0;
    const title = c.isNewEntity
      ? `New table discovered: ${c.entityName}`
      : c.isRemovedEntity
      ? `Table removed from source: ${c.entityName}`
      : schemaChanged
      ? `Schema change detected: ${c.entityName}`
      : `Metadata changed at source: ${c.entityName}`;

    const descParts: string[] = [];
    if (c.isNewEntity)     descParts.push("Table newly discovered on rescan.");
    if (c.isRemovedEntity) descParts.push("Table no longer found at the source — flagged deprecated.");
    if (c.addedColumns.length)    descParts.push(`Added: ${c.addedColumns.map((x) => x.name).join(", ")}`);
    if (c.modifiedColumns.length) descParts.push(`Type changed: ${c.modifiedColumns.map((x) => `${x.name} (${x.oldValue} → ${x.newValue})`).join(", ")}`);
    if (c.removedColumns.length)  descParts.push(`Removed: ${c.removedColumns.map((x) => x.name).join(", ")}`);
    if (c.attributeChanges?.length) {
      descParts.push(`Fields changed at the source: ${c.attributeChanges.slice(0, 20)
        .map((x) => `${x.attrName} on ${x.asset} (${x.oldValue ?? "empty"} → ${x.newValue ?? "empty"})`).join("; ")}${c.attributeChanges.length > 20 ? ` (+${c.attributeChanges.length - 20} more)` : ""}.`);
    }

    // Dedupe against an existing OPEN/IN_PROGRESS METADATA_UPDATE request for
    // this exact table — a table that keeps drifting across rescans before
    // anyone actions the first request shouldn't spawn duplicates (same
    // pattern as lib/dq-engine.ts's handleFailureActions).
    const existingReq = await sql<{ id: number }[]>`
      SELECT ar.request_id AS id
      FROM bayanat.asset_requests ar
      JOIN bayanat.asset_request_targets art ON art.request_id = ar.request_id
      WHERE ar.request_type_code = 'METADATA_UPDATE'
        AND ar.status_code IN ('OPEN','IN_PROGRESS')
        AND art.asset_type_code = 'DATA_ENTITIES'
        AND art.asset_id = ${c.entityId}
      LIMIT 1
    `;
    if (existingReq.length > 0) {
      // Still under review: add what this crawl found to that request rather than
      // dropping it, so reviewers see every change (e.g. a value changed twice).
      await sql`
        UPDATE bayanat.asset_requests
        SET description_text = concat_ws(E'\n\n', description_text, ${`Later crawl (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC): ${descParts.join(" ")}`}::text),
            updated_at = NOW()
        WHERE request_id = ${existingReq[0].id}
      `;
      continue;
    }

    // "Workflow enabled" == an admin has actually mapped one via
    // /admin/workflows — if not, skip creating a request entirely rather than
    // leaving an unrouted OPEN one nobody is watching.
    const mapping = await sql<{ workflowId: number }[]>`
      SELECT workflow_id AS "workflowId" FROM bayanat.request_type_workflows
      WHERE request_type_code = 'METADATA_UPDATE'
    `;
    if (mapping.length === 0) continue;

    const [req] = await sql<{ requestId: number }[]>`
      INSERT INTO bayanat.asset_requests
        (request_type_code, title, description_text, priority_code, raised_by_user_id)
      VALUES ('METADATA_UPDATE', ${title}, ${descParts.join(" ")}, 'MEDIUM', 'SYSTEM')
      RETURNING request_id AS "requestId"
    `;

    await sql`
      INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
      VALUES (${req.requestId}, 'DATA_ENTITIES', ${c.entityId}, ${c.entityName})
    `;
    await startWorkflow(req.requestId, "METADATA_UPDATE", title);
  }
}

// Resolves harvested FK column-pairs to attribute_ids and upserts them into
// attribute_reference_links as INTROSPECTED — the prerequisite the column-classifier's
// R3/R5/R6 rules need. Must run after saveCrawlResults() so both the FK column and the
// column it references already have attribute_ids (the referenced table may appear
// later in crawl order than the table with the FK).
async function persistForeignKeys(sourceId: number, foreignKeys: CrawlFk[]): Promise<void> {
  if (foreignKeys.length === 0) return;

  const attrRows = await sql<{ id: number; schema: string; table: string; column: string }[]>`
    SELECT a.attribute_id AS id, s.schema_name_text AS schema, e.entity_name_text AS table, a.physical_name_text AS column
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE s.data_source_id = ${sourceId}
  `;
  const attrIdByKey = new Map<string, number>();
  for (const r of attrRows) attrIdByKey.set(`${r.schema}.${r.table}.${r.column}`, r.id);

  const touchedLinkIds: number[] = [];
  for (const fk of foreignKeys) {
    const fkAttrId  = attrIdByKey.get(`${fk.schema}.${fk.table}.${fk.column}`);
    const refAttrId = attrIdByKey.get(`${fk.refSchema}.${fk.refTable}.${fk.refColumn}`);
    if (!fkAttrId || !refAttrId || fkAttrId === refAttrId) continue; // referenced table out of crawl scope, or excluded by config
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO bayanat.attribute_reference_links
        (fk_attribute_id, referenced_attribute_id, constraint_name_text, discovery_method_code, confidence_number)
      VALUES (${fkAttrId}, ${refAttrId}, ${fk.constraintName}, 'INTROSPECTED', 1.0)
      ON CONFLICT (fk_attribute_id, referenced_attribute_id) DO UPDATE SET
        constraint_name_text = EXCLUDED.constraint_name_text,
        discovery_method_code = 'INTROSPECTED',
        confidence_number = 1.0,
        discovered_at_timestamp = NOW()
      RETURNING link_id AS id
    `;
    touchedLinkIds.push(row.id);
  }

  // Drop INTROSPECTED links for this source no longer reported by this crawl (the FK
  // constraint was dropped at the source). NAME_INFERRED/MANUAL links are untouched —
  // this crawl finding no declared constraint doesn't invalidate a fallback/manual one.
  await sql`
    DELETE FROM bayanat.attribute_reference_links
    WHERE discovery_method_code = 'INTROSPECTED'
      AND fk_attribute_id IN (
        SELECT a.attribute_id FROM bayanat.data_attributes a
        JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
        JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
        WHERE s.data_source_id = ${sourceId}
      )
      AND link_id != ALL(${touchedLinkIds.length > 0 ? touchedLinkIds : [-1]})
  `;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function crawlDataSource(connectionId: number, triggeredByUserId: string | null = null): Promise<void> {
  const [cfgRow] = await sql<(ConnCfg & { connectionName: string })[]>`
    SELECT connection_name AS "connectionName", db_type_code AS "dbTypeCode",
           host_address AS "hostAddress", port_number AS "portNumber",
           database_name AS "databaseName", default_schema AS "defaultSchema",
           username_text AS "usernameText", password_text AS "passwordText",
           coalesce(ssl_enabled,false) AS "sslEnabled"
    FROM bayanat.connection_registry WHERE connection_id = ${connectionId}
  `;
  if (!cfgRow) throw new Error("Connection not found");
  cfgRow.passwordText = openSecret(cfgRow.passwordText);

  // Load crawl config (schema/table filters, profiling settings, governance defaults)
  const [configRow] = await sql<{
    schemaIncludeList: string[] | null; schemaExcludeList: string[];
    tableExcludePatterns: string[]; profilingEnabled: boolean;
    profilingMode: string; profilingLimit: number;
    defaultOwnerUserId: string | null; defaultBizStewardId: string | null;
    defaultTechStewardId: string | null;
  }[]>`
    SELECT schema_include_list AS "schemaIncludeList",
           coalesce(schema_exclude_list, ARRAY[]::TEXT[]) AS "schemaExcludeList",
           coalesce(table_exclude_patterns, ARRAY[]::TEXT[]) AS "tableExcludePatterns",
           profiling_enabled AS "profilingEnabled",
           profiling_mode    AS "profilingMode",
           profiling_limit   AS "profilingLimit",
           default_owner_user_id   AS "defaultOwnerUserId",
           default_biz_steward_id  AS "defaultBizStewardId",
           default_tech_steward_id AS "defaultTechStewardId"
    FROM bayanat.crawl_config WHERE connection_id = ${connectionId}
  `;
  const config = configRow ?? null;
  const govDefaults: GovernanceDefaults = {
    defaultOwnerUserId:   configRow?.defaultOwnerUserId   ?? null,
    defaultBizStewardId:  configRow?.defaultBizStewardId  ?? null,
    defaultTechStewardId: configRow?.defaultTechStewardId ?? null,
  };

  const logger = await makeJobLogger(connectionId, cfgRow.connectionName, triggeredByUserId);
  await logger.info(`Starting crawl of ${cfgRow.connectionName} (${cfgRow.dbTypeCode})`);
  if (config) {
    if (config.schemaIncludeList?.length) await logger.info(`Schema include: ${config.schemaIncludeList.join(", ")}`);
    if (config.schemaExcludeList?.length) await logger.info(`Schema exclude: ${config.schemaExcludeList.join(", ")}`);
    if (config.tableExcludePatterns?.length) await logger.info(`Table exclude patterns: ${config.tableExcludePatterns.join(", ")}`);
    if (config.profilingEnabled) await logger.info(`Profiling: ${config.profilingMode} (limit=${config.profilingLimit})`);
  }

  let result: CrawlResult;
  try {
    if      (cfgRow.dbTypeCode === "POSTGRES") result = await crawlPostgres(cfgRow, config, logger);
    else if (cfgRow.dbTypeCode === "MYSQL")    result = await crawlMysql(cfgRow, config, logger);
    else if (cfgRow.dbTypeCode === "MSSQL")    result = await crawlMssql(cfgRow, config, logger);
    else if (cfgRow.dbTypeCode === "ORACLE")   result = await crawlOracle(cfgRow, config, logger);
    else if (cfgRow.dbTypeCode === "CSV" || cfgRow.dbTypeCode === "EXCEL") result = await crawlFile(cfgRow, config, logger);
    else if (cfgRow.dbTypeCode === "JSON") result = await crawlJson(cfgRow, config, logger);
    else if (cfgRow.dbTypeCode === "REST_API") result = await crawlRestApi(cfgRow, config, logger);
    else if (cfgRow.dbTypeCode === "SOAP_API") result = await crawlSoapApi(cfgRow, config, logger);
    else throw new Error(`Unsupported DB type: ${cfgRow.dbTypeCode}`);

    await logger.info(`Crawl complete: ${result.schemaCount} schemas, ${result.tableCount} tables, ${result.columnCount} columns`);
    const { sourceId, isFirstCrawl, changes } = await saveCrawlResults(connectionId, cfgRow.connectionName, cfgRow.dbTypeCode, cfgRow.hostAddress, cfgRow.databaseName, result, logger.jobId, govDefaults);

    // Custom attributes mapped to extended properties / comment keys. The source
    // wins; value changes join the table's metadata-update review below.
    try {
      await applySourceAttributes({
        sourceId, dbTypeCode: cfgRow.dbTypeCode, schemas: result.schemas, isFirstCrawl, actor: SYSTEM_ACTOR,
        log: (m) => logger.info(m),
        onChange: (entityId, entityName, schemaId, change) => {
          let c = changes.find((x) => x.entityId === entityId);
          if (!c) {
            c = { entityId, entityName, schemaId, isNewEntity: false, isRemovedEntity: false, addedColumns: [], modifiedColumns: [], removedColumns: [] };
            changes.push(c);
          }
          (c.attributeChanges ??= []).push(change);
        },
      });
    } catch (e) {
      await logger.warn(`Custom attributes from source failed: ${(e as Error).message}`);
    }

    // Built-in descriptive fields (table type, column type, friendly name, encrypted)
    // mapped the same way. Changes join the same metadata-update review.
    try {
      await applySourceBuiltinFields({
        sourceId, dbTypeCode: cfgRow.dbTypeCode, schemas: result.schemas, isFirstCrawl, actor: SYSTEM_ACTOR,
        log: (m) => logger.info(m),
        onChange: (entityId, entityName, schemaId, change) => {
          let c = changes.find((x) => x.entityId === entityId);
          if (!c) {
            c = { entityId, entityName, schemaId, isNewEntity: false, isRemovedEntity: false, addedColumns: [], modifiedColumns: [], removedColumns: [] };
            changes.push(c);
          }
          (c.attributeChanges ??= []).push(change);
        },
      });
    } catch (e) {
      await logger.warn(`Built-in fields from source failed: ${(e as Error).message}`);
    }

    if (changes.length > 0) {
      await logger.info(`Schema changes detected: ${changes.length} table(s)${isFirstCrawl ? " (first crawl — no notifications/workflow)" : ""}`);
      await processEntityChanges(changes, isFirstCrawl);
    }

    const [crawlerSettingsRow] = await sql<{ settings: {
      auto_classify_columns?: boolean; classify_scope?: "NEW_ONLY" | "UNCLASSIFIED_ONLY" | "ALL";
      harvest_fk_constraints?: boolean; infer_fk_by_naming?: boolean; auto_accept_band?: "NONE" | "HIGH";
    } }[]>`
      SELECT crawler_settings_json AS settings FROM bayanat.connection_registry WHERE connection_id = ${connectionId}
    `;
    const crawlerSettings = crawlerSettingsRow?.settings ?? {};

    if (crawlerSettings.harvest_fk_constraints !== false && result.foreignKeys.length > 0) {
      await logger.info(`Harvesting FK topology: ${result.foreignKeys.length} constraint(s) found`);
      await persistForeignKeys(sourceId, result.foreignKeys);
    }

    if (crawlerSettings.auto_classify_columns !== false) {
      try {
        const { runColumnClassification } = await import("./classification-runner");
        const summary = await runColumnClassification({
          scopeType: "DATA_SOURCE", scopeId: sourceId,
          scopeMode: crawlerSettings.classify_scope ?? "NEW_ONLY",
          triggeredByUserId: SYSTEM_ACTOR,
          autoAcceptBand: crawlerSettings.auto_accept_band ?? "NONE",
          inferFkByNaming: crawlerSettings.infer_fk_by_naming !== false,
          crawlJobId: logger.jobId,
        });
        await logger.info(`Column classification: ${summary.attributesEvaluated} evaluated, ${summary.suggestionsChanged} suggestion(s) changed`);
      } catch (e) {
        await logger.warn(`Column classification step failed: ${(e as Error).message}`);
      }
    }

    // Profiling just stored min/max/top values: drop them again for personal-data columns.
    maskStoredPersonalDataQuietly("crawl");

    await finishJob(logger.jobId, result, cfgRow.connectionName, triggeredByUserId);

    await sql`
      UPDATE bayanat.connection_registry SET
        crawl_status          = 'COMPLETED',
        crawl_error_text      = NULL,
        crawled_schema_count  = ${result.schemaCount},
        crawled_table_count   = ${result.tableCount},
        crawled_column_count  = ${result.columnCount},
        last_discovery_timestamp = NOW()
      WHERE connection_id = ${connectionId}
    `;
  } catch (e: unknown) {
    const msg = (e as Error).message;
    await logger.error(`Crawl failed: ${msg}`);
    await failJob(logger.jobId, msg, cfgRow.connectionName, triggeredByUserId);
    await sql`UPDATE bayanat.connection_registry SET crawl_status='FAILED', crawl_error_text=${msg} WHERE connection_id=${connectionId}`;
    throw e;
  }
}
