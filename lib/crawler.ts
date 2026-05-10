import postgres from "postgres";
import { sql } from "./db";

type CrawlColumn = { name: string; dataType: string; isNullable: boolean; isPrimaryKey: boolean; defaultValue: string | null };
type CrawlTable  = { name: string; isView: boolean; columns: CrawlColumn[] };
type CrawlSchema = { name: string; tables: CrawlTable[] };
export type CrawlResult = { schemas: CrawlSchema[]; schemaCount: number; tableCount: number; columnCount: number };

type ConnCfg = {
  connectionId: number; dbTypeCode: string; hostAddress: string; portNumber: number;
  databaseName: string | null; defaultSchema: string | null;
  usernameText: string | null; passwordText: string | null; sslEnabled: boolean;
};

// ── PostgreSQL ───────────────────────────────────────────────────────────────
async function crawlPostgres(cfg: ConnCfg): Promise<CrawlResult> {
  const pg = postgres({
    host: cfg.hostAddress, port: cfg.portNumber,
    database: cfg.databaseName || "postgres",
    username: cfg.usernameText || undefined,
    password: cfg.passwordText || undefined,
    ssl: cfg.sslEnabled ? "require" : false,
    max: 1, connect_timeout: 15,
  });
  try {
    const schemaRows = await pg<{ n: string }[]>`
      SELECT schema_name AS n FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast','pg_temp_1','pg_toast_temp_1')
      AND schema_name NOT LIKE 'pg_temp_%' AND schema_name NOT LIKE 'pg_toast_temp_%'
      ORDER BY schema_name
    `;
    const schemas: CrawlSchema[] = [];
    for (const sr of schemaRows) {
      if (cfg.defaultSchema && sr.n !== cfg.defaultSchema) continue;
      const tableRows = await pg<{ t: string; v: string }[]>`
        SELECT table_name AS t, table_type AS v FROM information_schema.tables
        WHERE table_schema = ${sr.n} ORDER BY table_name
      `;
      const tables: CrawlTable[] = [];
      for (const tr of tableRows) {
        const pkRows = await pg<{ c: string }[]>`
          SELECT a.attname AS c FROM pg_index i
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          JOIN pg_class cl ON cl.oid = i.indrelid
          JOIN pg_namespace ns ON ns.oid = cl.relnamespace
          WHERE i.indisprimary AND ns.nspname = ${sr.n} AND cl.relname = ${tr.t}
        `;
        const pk = new Set(pkRows.map(r => r.c));
        const cols = await pg<{ n: string; dt: string; nl: string; def: string | null }[]>`
          SELECT column_name AS n, data_type AS dt, is_nullable AS nl, column_default AS def
          FROM information_schema.columns
          WHERE table_schema = ${sr.n} AND table_name = ${tr.t} ORDER BY ordinal_position
        `;
        tables.push({
          name: tr.t, isView: tr.v === "VIEW",
          columns: cols.map(c => ({ name: c.n, dataType: c.dt, isNullable: c.nl === "YES", isPrimaryKey: pk.has(c.n), defaultValue: c.def })),
        });
      }
      if (tables.length > 0) schemas.push({ name: sr.n, tables });
    }
    return summarise(schemas);
  } finally { await pg.end(); }
}

// ── MySQL ────────────────────────────────────────────────────────────────────
async function crawlMysql(cfg: ConnCfg): Promise<CrawlResult> {
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
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','performance_schema','mysql','sys') ORDER BY schema_name`
    );
    const schemas: CrawlSchema[] = [];
    for (const dbRow of dbRows as Record<string, string>[]) {
      const sname = dbRow.schema_name || dbRow.SCHEMA_NAME;
      if (cfg.defaultSchema && sname !== cfg.defaultSchema) continue;
      if (cfg.databaseName && sname !== cfg.databaseName) continue;
      const [tRows] = await conn.query(`SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`, [sname]);
      const tables: CrawlTable[] = [];
      for (const tRow of tRows as Record<string, string>[]) {
        const tname = tRow.table_name || tRow.TABLE_NAME;
        const ttype = tRow.table_type || tRow.TABLE_TYPE;
        const [cRows] = await conn.query(`SELECT column_name, data_type, is_nullable, column_default, column_key FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`, [sname, tname]);
        tables.push({
          name: tname, isView: ttype === "VIEW",
          columns: (cRows as Record<string, string>[]).map(c => ({
            name: c.column_name || c.COLUMN_NAME,
            dataType: c.data_type || c.DATA_TYPE,
            isNullable: (c.is_nullable || c.IS_NULLABLE) === "YES",
            isPrimaryKey: (c.column_key || c.COLUMN_KEY) === "PRI",
            defaultValue: c.column_default || c.COLUMN_DEFAULT || null,
          })),
        });
      }
      if (tables.length > 0) schemas.push({ name: sname, tables });
    }
    return summarise(schemas);
  } finally { await conn.end(); }
}

// ── SQL Server ───────────────────────────────────────────────────────────────
async function crawlMssql(cfg: ConnCfg): Promise<CrawlResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mssql: any;
  try { mssql = await import("mssql"); }
  catch { throw new Error("mssql driver not installed — run: npm install mssql"); }
  const pool = await mssql.connect({
    server: cfg.hostAddress, port: cfg.portNumber,
    database: cfg.databaseName || undefined,
    user: cfg.usernameText || undefined,
    password: cfg.passwordText || undefined,
    options: { encrypt: cfg.sslEnabled, trustServerCertificate: !cfg.sslEnabled, connectTimeout: 15000 },
  });
  try {
    const sysSchemas = new Set(["sys","INFORMATION_SCHEMA","guest","db_owner","db_accessadmin","db_securityadmin","db_ddladmin","db_backupoperator","db_datareader","db_datawriter","db_denydatareader","db_denydatawriter"]);
    const sr = await pool.request().query(`SELECT name AS schema_name FROM sys.schemas ORDER BY name`);
    const schemas: CrawlSchema[] = [];
    for (const row of sr.recordset) {
      const sname: string = row.schema_name;
      if (sysSchemas.has(sname)) continue;
      if (cfg.defaultSchema && sname !== cfg.defaultSchema) continue;
      const tr = await pool.request().input("s", mssql.VarChar, sname).query(`
        SELECT t.name AS table_name, 'BASE TABLE' AS table_type FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name=@s
        UNION ALL SELECT v.name,'VIEW' FROM sys.views v JOIN sys.schemas s ON v.schema_id=s.schema_id WHERE s.name=@s ORDER BY table_name`);
      const tables: CrawlTable[] = [];
      for (const trow of tr.recordset) {
        const pkr = await pool.request().input("s",mssql.VarChar,sname).input("t",mssql.VarChar,trow.table_name).query(`
          SELECT col.name AS cn FROM sys.indexes i JOIN sys.index_columns ic ON i.object_id=ic.object_id AND i.index_id=ic.index_id
          JOIN sys.columns col ON col.object_id=ic.object_id AND col.column_id=ic.column_id
          JOIN sys.tables tb ON tb.object_id=i.object_id JOIN sys.schemas sc ON sc.schema_id=tb.schema_id
          WHERE i.is_primary_key=1 AND sc.name=@s AND tb.name=@t`);
        const pk = new Set(pkr.recordset.map((r: Record<string, string>) => r.cn));
        const cr = await pool.request().input("s",mssql.VarChar,sname).input("t",mssql.VarChar,trow.table_name).query(`
          SELECT c.name AS cn, tp.name AS dt, c.is_nullable AS nl FROM sys.columns c
          JOIN sys.tables tb ON tb.object_id=c.object_id JOIN sys.schemas sc ON sc.schema_id=tb.schema_id
          JOIN sys.types tp ON tp.user_type_id=c.user_type_id WHERE sc.name=@s AND tb.name=@t ORDER BY c.column_id`);
        tables.push({
          name: trow.table_name, isView: trow.table_type === "VIEW",
          columns: cr.recordset.map((c: Record<string, string | boolean>) => ({ name: c.cn as string, dataType: c.dt as string, isNullable: !!c.nl, isPrimaryKey: pk.has(c.cn as string), defaultValue: null })),
        });
      }
      if (tables.length > 0) schemas.push({ name: sname, tables });
    }
    return summarise(schemas);
  } finally { await pool.close(); }
}

// ── Oracle (requires oracledb + Instant Client) ───────────────────────────────
async function crawlOracle(cfg: ConnCfg): Promise<CrawlResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let oracledb: any;
  try { oracledb = await import("oracledb"); }
  catch { throw new Error("oracledb driver not installed — run: npm install oracledb (also requires Oracle Instant Client)"); }
  const conn = await oracledb.getConnection({
    user: cfg.usernameText || undefined,
    password: cfg.passwordText || undefined,
    connectString: `${cfg.hostAddress}:${cfg.portNumber}/${cfg.databaseName || "XE"}`,
  });
  try {
    const SYS = ["SYS","SYSTEM","OUTLN","DBSNMP","APPQOSSYS","ORDDATA","WMSYS","EXFSYS","CTXSYS","XDB"];
    const targetSchema = cfg.defaultSchema?.toUpperCase() || cfg.usernameText?.toUpperCase();
    const schemaFilter = targetSchema ? `AND owner = '${targetSchema.replace(/'/g,"''")}'` : `AND owner NOT IN (${SYS.map(s=>`'${s}'`).join(",")})`;
    const tabRes = await conn.execute(`
      SELECT owner,table_name,'BASE TABLE' AS ttype FROM all_tables WHERE 1=1 ${schemaFilter}
      UNION ALL SELECT owner,view_name,'VIEW' FROM all_views WHERE 1=1 ${schemaFilter} ORDER BY 1,2`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const schemaMap = new Map<string, CrawlTable[]>();
    for (const row of (tabRes.rows || []) as Record<string, string>[]) {
      const owner = row.OWNER; const tname = row.TABLE_NAME;
      if (!schemaMap.has(owner)) schemaMap.set(owner, []);
      const colRes = await conn.execute(`SELECT column_name,data_type,nullable FROM all_tab_columns WHERE owner=:o AND table_name=:t ORDER BY column_id`, { o: owner, t: tname }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const pkRes  = await conn.execute(`SELECT cc.column_name FROM all_constraints c JOIN all_cons_columns cc ON cc.constraint_name=c.constraint_name AND cc.owner=c.owner WHERE c.owner=:o AND c.table_name=:t AND c.constraint_type='P'`, { o: owner, t: tname }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const pk = new Set((pkRes.rows || []).map((r: Record<string,string>) => r.COLUMN_NAME));
      schemaMap.get(owner)!.push({
        name: tname, isView: row.TTYPE === "VIEW",
        columns: (colRes.rows || []).map((c: Record<string, string>) => ({ name: c.COLUMN_NAME, dataType: c.DATA_TYPE, isNullable: c.NULLABLE === "Y", isPrimaryKey: pk.has(c.COLUMN_NAME), defaultValue: null })),
      });
    }
    return summarise(Array.from(schemaMap.entries()).map(([name, tables]) => ({ name, tables })));
  } finally { await conn.close(); }
}

function summarise(schemas: CrawlSchema[]): CrawlResult {
  const tableCount  = schemas.reduce((s, sc) => s + sc.tables.length, 0);
  const columnCount = schemas.reduce((s, sc) => s + sc.tables.reduce((t, tb) => t + tb.columns.length, 0), 0);
  return { schemas, schemaCount: schemas.length, tableCount, columnCount };
}

// ── Test connection (no crawl) ───────────────────────────────────────────────
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
      const pg = postgres({ host: cfg.hostAddress, port: cfg.portNumber, database: cfg.databaseName || "postgres", username: cfg.usernameText || undefined, password: cfg.passwordText || undefined, ssl: cfg.sslEnabled ? "require" : false, max: 1, connect_timeout: 10 });
      const [v] = await pg<{ v: string }[]>`SELECT version() AS v`;
      await pg.end();
      return { ok: true, message: v.v.split(",")[0] };
    }
    if (cfg.dbTypeCode === "MYSQL") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m2 = await import("mysql2/promise") as any;
      const c = await m2.createConnection({ host: cfg.hostAddress, port: cfg.portNumber, user: cfg.usernameText || undefined, password: cfg.passwordText || undefined, database: cfg.databaseName || undefined, ssl: cfg.sslEnabled ? { rejectUnauthorized: false } : undefined, connectTimeout: 10000 });
      const [rows] = await c.query("SELECT VERSION() AS v");
      await c.end();
      return { ok: true, message: `MySQL ${(rows as Record<string,string>[])[0].v}` };
    }
    if (cfg.dbTypeCode === "MSSQL") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ms = await import("mssql") as any;
      const pool = await ms.connect({ server: cfg.hostAddress, port: cfg.portNumber, user: cfg.usernameText || undefined, password: cfg.passwordText || undefined, database: cfg.databaseName || undefined, options: { encrypt: cfg.sslEnabled, trustServerCertificate: !cfg.sslEnabled, connectTimeout: 10000 } });
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

// ── Full crawl + save to catalog ─────────────────────────────────────────────
async function saveCrawlResults(connectionId: number, connectionName: string, dbTypeCode: string, hostAddress: string, databaseName: string | null, result: CrawlResult): Promise<void> {
  const existing = await sql<{ id: number }[]>`SELECT data_source_id AS id FROM bayanat.data_sources WHERE connection_id = ${connectionId}`;
  let sourceId: number;
  if (existing.length > 0) {
    sourceId = existing[0].id;
    await sql`DELETE FROM bayanat.data_schemas WHERE data_source_id = ${sourceId}`;
  } else {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO bayanat.data_sources (source_name_text, source_type_code, host_address_text, database_name_text, connection_id)
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
        INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, is_view_indicator)
        VALUES (${schRow.id}, ${table.name}, ${table.name}, ${table.isView}) RETURNING entity_id AS id
      `;
      for (const col of table.columns) {
        await sql`
          INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, is_nullable_indicator, is_primary_key_indicator)
          VALUES (${entRow.id}, ${col.name}, ${col.name}, ${col.dataType}, ${col.isNullable}, ${col.isPrimaryKey})
        `;
      }
    }
  }
}

export async function crawlDataSource(connectionId: number): Promise<void> {
  const [cfg] = await sql<(ConnCfg & { connectionName: string })[]>`
    SELECT connection_name AS "connectionName", db_type_code AS "dbTypeCode",
           host_address AS "hostAddress", port_number AS "portNumber",
           database_name AS "databaseName", default_schema AS "defaultSchema",
           username_text AS "usernameText", password_text AS "passwordText",
           coalesce(ssl_enabled,false) AS "sslEnabled"
    FROM bayanat.connection_registry WHERE connection_id = ${connectionId}
  `;
  if (!cfg) throw new Error("Connection not found");

  let result: CrawlResult;
  if      (cfg.dbTypeCode === "POSTGRES") result = await crawlPostgres(cfg);
  else if (cfg.dbTypeCode === "MYSQL")    result = await crawlMysql(cfg);
  else if (cfg.dbTypeCode === "MSSQL")    result = await crawlMssql(cfg);
  else if (cfg.dbTypeCode === "ORACLE")   result = await crawlOracle(cfg);
  else throw new Error(`Unsupported DB type: ${cfg.dbTypeCode}`);

  await saveCrawlResults(connectionId, cfg.connectionName, cfg.dbTypeCode, cfg.hostAddress, cfg.databaseName, result);

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
}
