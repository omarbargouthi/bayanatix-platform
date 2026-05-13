import postgres from "postgres";
import { sql } from "./db";
import { applyGovernanceDefaults } from "./queries/stakeholders";
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
  isPrimaryKey: boolean; defaultValue: string | null;
  comment?: string | null;
  profile?: ColProfile;
};

type CrawlTable  = { name: string; isView: boolean; columns: CrawlColumn[]; comment?: string | null; rowCount?: number; sampleSize?: number };
type CrawlSchema = { name: string; tables: CrawlTable[] };

export type CrawlResult = {
  schemas:      CrawlSchema[];
  schemaCount:  number;
  tableCount:   number;
  columnCount:  number;
  profilingMode?:  string;
  profilingLimit?: number;
};

type ConnCfg = {
  connectionId: number; dbTypeCode: string; hostAddress: string; portNumber: number;
  databaseName: string | null; defaultSchema: string | null;
  usernameText: string | null; passwordText: string | null; sslEnabled: boolean;
};

// ── Job logger ────────────────────────────────────────────────────────────────

type JobLogger = {
  jobId: number;
  info(msg: string): Promise<void>;
  warn(msg: string): Promise<void>;
  error(msg: string): Promise<void>;
};

async function makeJobLogger(connectionId: number, connectionName: string): Promise<JobLogger> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.crawl_jobs (connection_id, connection_name)
    VALUES (${connectionId}, ${connectionName}) RETURNING job_id AS id
  `;
  const jobId = row.id;
  const log = async (level: string, msg: string) =>
    void sql`INSERT INTO bayanat.crawl_job_logs (job_id, level, message) VALUES (${jobId}, ${level}, ${msg})`
      .catch(() => {});
  return { jobId, info: m => log("INFO", m), warn: m => log("WARN", m), error: m => log("ERROR", m) };
}

async function finishJob(jobId: number, result: CrawlResult): Promise<void> {
  await sql`UPDATE bayanat.crawl_jobs SET status='COMPLETED', finished_at=NOW(),
    schema_count=${result.schemaCount}, table_count=${result.tableCount},
    column_count=${result.columnCount} WHERE job_id=${jobId}`;
}

async function failJob(jobId: number, errorText: string): Promise<void> {
  await sql`UPDATE bayanat.crawl_jobs SET status='FAILED', finished_at=NOW(),
    error_text=${errorText} WHERE job_id=${jobId}`;
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
          isNullable: c.nl === "YES", isPrimaryKey: pk.has(c.n), defaultValue: c.def,
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

        tables.push({ name: tr.t, isView: tr.v === "VIEW", columns, comment: tCommentRow?.cmt ?? null, rowCount, sampleSize });
      }

      if (tables.length > 0) schemas.push({ name: sr.n, tables });
      await logger.info(`  → ${tables.length} tables/views in ${sr.n}`);
    }

    return {
      ...summarise(schemas),
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
    for (const dbRow of dbRows as Record<string, string>[]) {
      const sname = dbRow.schema_name || dbRow.SCHEMA_NAME;
      if (!schemaIncluded(sname, config)) continue;
      if (cfg.databaseName && sname !== cfg.databaseName) continue;

      await logger.info(`Crawling schema: ${sname}`);
      const [tRows] = await conn.query(
        `SELECT table_name, table_type, table_comment FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`, [sname],
      );
      const tables: CrawlTable[] = [];
      for (const tRow of tRows as Record<string, string>[]) {
        const tname = tRow.table_name || tRow.TABLE_NAME;
        if (!tableIncluded(tname, config)) continue;
        const ttype = tRow.table_type || tRow.TABLE_TYPE;
        const tcomment = tRow.table_comment || tRow.TABLE_COMMENT || null;
        const [cRows] = await conn.query(
          `SELECT column_name, data_type, is_nullable, column_default, column_key, column_comment
           FROM information_schema.columns
           WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`, [sname, tname],
        );
        tables.push({
          name: tname, isView: ttype === "VIEW",
          comment: tcomment || null,
          columns: (cRows as Record<string, string>[]).map(c => ({
            name:         c.column_name    || c.COLUMN_NAME,
            dataType:     c.data_type      || c.DATA_TYPE,
            isNullable:   (c.is_nullable   || c.IS_NULLABLE) === "YES",
            isPrimaryKey: (c.column_key    || c.COLUMN_KEY)  === "PRI",
            defaultValue: c.column_default || c.COLUMN_DEFAULT || null,
            comment:      c.column_comment || c.COLUMN_COMMENT || null,
          })),
        });
      }
      if (tables.length > 0) schemas.push({ name: sname, tables });
      await logger.info(`  → ${tables.length} tables/views in ${sname}`);
    }
    return summarise(schemas);
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
        tables.push({
          name: trow.table_name, isView: trow.table_type === "VIEW",
          comment: tcmt.recordset[0]?.cmt ?? null,
          columns: cr.recordset.map((c: Record<string, string|boolean|null>) => ({
            name: c.cn as string, dataType: c.dt as string,
            isNullable: !!c.nl, isPrimaryKey: pk.has(c.cn as string), defaultValue: null,
            comment: c.cmt as string | null ?? null,
          })),
        });
      }
      if (tables.length > 0) schemas.push({ name: sname, tables });
      await logger.info(`  → ${tables.length} tables/views in ${sname}`);
    }
    return summarise(schemas);
  } finally { await pool.close(); }
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
      `SELECT owner,table_name,'BASE TABLE' AS ttype FROM all_tables WHERE 1=1 ${schemaFilter}
       UNION ALL SELECT owner,view_name,'VIEW' FROM all_views WHERE 1=1 ${schemaFilter} ORDER BY 1,2`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const schemaMap = new Map<string, CrawlTable[]>();

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
      const tCommentRes = await conn.execute(
        `SELECT comments FROM all_tab_comments WHERE owner=:o AND table_name=:t`,
        { o: owner, t: tname }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const cCommentRes = await conn.execute(
        `SELECT column_name, comments FROM all_col_comments WHERE owner=:o AND table_name=:t`,
        { o: owner, t: tname }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const pk = new Set((pkRes.rows || []).map((r: Record<string,string>) => r.COLUMN_NAME));
      const colCmts = new Map(((cCommentRes.rows || []) as Record<string,string>[]).map(r => [r.COLUMN_NAME, r.COMMENTS ?? null]));
      schemaMap.get(owner)!.push({
        name: tname, isView: row.TTYPE === "VIEW",
        comment: ((tCommentRes.rows || []) as Record<string,string>[])[0]?.COMMENTS ?? null,
        columns: (colRes.rows || []).map((c: Record<string, string>) => ({
          name: c.COLUMN_NAME, dataType: c.DATA_TYPE,
          isNullable: c.NULLABLE === "Y", isPrimaryKey: pk.has(c.COLUMN_NAME), defaultValue: null,
          comment: colCmts.get(c.COLUMN_NAME) ?? null,
        })),
      });
    }
    for (const [schema] of schemaMap) await logger.info(`Crawled schema: ${schema}`);
    return summarise(Array.from(schemaMap.entries()).map(([name, tables]) => ({ name, tables })));
  } finally { await conn.close(); }
}

// ── Summarise ─────────────────────────────────────────────────────────────────

function summarise(schemas: CrawlSchema[]): CrawlResult {
  const tableCount  = schemas.reduce((s, sc) => s + sc.tables.length, 0);
  const columnCount = schemas.reduce((s, sc) => s + sc.tables.reduce((t, tb) => t + tb.columns.length, 0), 0);
  return { schemas, schemaCount: schemas.length, tableCount, columnCount };
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
  defaultCustodianId:   string | null;
};

async function saveCrawlResults(
  connectionId: number, connectionName: string, dbTypeCode: string,
  hostAddress: string, databaseName: string | null,
  result: CrawlResult, jobId: number,
  govDefaults: GovernanceDefaults,
): Promise<void> {
  const existing = await sql<{ id: number }[]>`
    SELECT data_source_id AS id FROM bayanat.data_sources WHERE connection_id = ${connectionId}
  `;
  let sourceId: number;
  // Snapshot row counts before the cascade-delete so we can store prev_row_count
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
    await sql`DELETE FROM bayanat.data_schemas WHERE data_source_id = ${sourceId}`;
  } else {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO bayanat.data_sources
        (source_name_text, source_type_code, host_address_text, database_name_text, connection_id)
      VALUES (${connectionName}, ${dbTypeCode}, ${hostAddress}, ${databaseName || ""}, ${connectionId})
      RETURNING data_source_id AS id
    `;
    sourceId = row.id;
  }

  for (const schema of result.schemas) {
    const [schRow] = await sql<{ id: number }[]>`
      INSERT INTO bayanat.data_schemas (data_source_id, schema_name_text)
      VALUES (${sourceId}, ${schema.name}) RETURNING schema_id AS id
    `;

    for (const table of schema.tables) {
      const [entRow] = await sql<{ id: number }[]>`
        INSERT INTO bayanat.data_entities
          (schema_id, entity_name_text, display_name_text, is_view_indicator, source_description_text)
        VALUES (${schRow.id}, ${table.name}, ${table.name}, ${table.isView}, ${table.comment ?? null})
        RETURNING entity_id AS id
      `;
      const entityId = entRow.id;

      // Apply default governance roles from crawl config (fire-and-forget — non-blocking)
      void applyGovernanceDefaults(
        entityId,
        govDefaults.defaultOwnerUserId,
        govDefaults.defaultBizStewardId,
        govDefaults.defaultTechStewardId,
        govDefaults.defaultCustodianId,
      ).catch(() => {});

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
        const [attrRow] = await sql<{ id: number }[]>`
          INSERT INTO bayanat.data_attributes
            (entity_id, physical_name_text, friendly_name_text, data_type_text,
             is_nullable_indicator, is_primary_key_indicator, source_description_text)
          VALUES (${entityId}, ${col.name}, ${col.name}, ${col.dataType}, ${col.isNullable}, ${col.isPrimaryKey}, ${col.comment ?? null})
          RETURNING attribute_id AS id
        `;

        if (profileId && col.profile) {
          await sql`
            INSERT INTO bayanat.attribute_profile
              (profile_id, attribute_id, null_count, null_pct, distinct_count,
               min_value, max_value, top_values)
            VALUES (
              ${profileId}, ${attrRow.id},
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
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function crawlDataSource(connectionId: number): Promise<void> {
  const [cfgRow] = await sql<(ConnCfg & { connectionName: string })[]>`
    SELECT connection_name AS "connectionName", db_type_code AS "dbTypeCode",
           host_address AS "hostAddress", port_number AS "portNumber",
           database_name AS "databaseName", default_schema AS "defaultSchema",
           username_text AS "usernameText", password_text AS "passwordText",
           coalesce(ssl_enabled,false) AS "sslEnabled"
    FROM bayanat.connection_registry WHERE connection_id = ${connectionId}
  `;
  if (!cfgRow) throw new Error("Connection not found");

  // Load crawl config (schema/table filters, profiling settings, governance defaults)
  const [configRow] = await sql<{
    schemaIncludeList: string[] | null; schemaExcludeList: string[];
    tableExcludePatterns: string[]; profilingEnabled: boolean;
    profilingMode: string; profilingLimit: number;
    defaultOwnerUserId: string | null; defaultBizStewardId: string | null;
    defaultTechStewardId: string | null; defaultCustodianId: string | null;
  }[]>`
    SELECT schema_include_list AS "schemaIncludeList",
           coalesce(schema_exclude_list, ARRAY[]::TEXT[]) AS "schemaExcludeList",
           coalesce(table_exclude_patterns, ARRAY[]::TEXT[]) AS "tableExcludePatterns",
           profiling_enabled AS "profilingEnabled",
           profiling_mode    AS "profilingMode",
           profiling_limit   AS "profilingLimit",
           default_owner_user_id   AS "defaultOwnerUserId",
           default_biz_steward_id  AS "defaultBizStewardId",
           default_tech_steward_id AS "defaultTechStewardId",
           default_custodian_user_id AS "defaultCustodianId"
    FROM bayanat.crawl_config WHERE connection_id = ${connectionId}
  `;
  const config = configRow ?? null;
  const govDefaults: GovernanceDefaults = {
    defaultOwnerUserId:   configRow?.defaultOwnerUserId   ?? null,
    defaultBizStewardId:  configRow?.defaultBizStewardId  ?? null,
    defaultTechStewardId: configRow?.defaultTechStewardId ?? null,
    defaultCustodianId:   configRow?.defaultCustodianId   ?? null,
  };

  const logger = await makeJobLogger(connectionId, cfgRow.connectionName);
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
    else throw new Error(`Unsupported DB type: ${cfgRow.dbTypeCode}`);

    await logger.info(`Crawl complete: ${result.schemaCount} schemas, ${result.tableCount} tables, ${result.columnCount} columns`);
    await saveCrawlResults(connectionId, cfgRow.connectionName, cfgRow.dbTypeCode, cfgRow.hostAddress, cfgRow.databaseName, result, logger.jobId, govDefaults);
    await finishJob(logger.jobId, result);

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
    await failJob(logger.jobId, msg);
    await sql`UPDATE bayanat.connection_registry SET crawl_status='FAILED', crawl_error_text=${msg} WHERE connection_id=${connectionId}`;
    throw e;
  }
}
