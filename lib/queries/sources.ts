import { sql } from "../db";

export type CrawlConfig = {
  configId:              number | null;
  connectionId:          number;
  schemaIncludeList:     string[] | null;
  schemaExcludeList:     string[];
  tableExcludePatterns:  string[];
  profilingEnabled:      boolean;
  profilingMode:         "TOP_N" | "TOP_PCT" | "FULL";
  profilingLimit:        number;
  // Default governance assignments applied to all newly discovered entities
  defaultOwnerUserId:   string | null;
  defaultBizStewardId:  string | null;
  defaultTechStewardId: string | null;
};

export async function getCrawlConfig(connectionId: number): Promise<CrawlConfig> {
  const rows = await sql<CrawlConfig[]>`
    SELECT config_id AS "configId", connection_id AS "connectionId",
           schema_include_list    AS "schemaIncludeList",
           coalesce(schema_exclude_list,    ARRAY[]::TEXT[]) AS "schemaExcludeList",
           coalesce(table_exclude_patterns, ARRAY[]::TEXT[]) AS "tableExcludePatterns",
           profiling_enabled AS "profilingEnabled",
           profiling_mode    AS "profilingMode",
           profiling_limit   AS "profilingLimit",
           default_owner_user_id   AS "defaultOwnerUserId",
           default_biz_steward_id  AS "defaultBizStewardId",
           default_tech_steward_id AS "defaultTechStewardId"
    FROM bayanat.crawl_config WHERE connection_id = ${connectionId}
  `;
  return rows[0] ?? {
    configId: null, connectionId,
    schemaIncludeList: null, schemaExcludeList: [], tableExcludePatterns: [],
    profilingEnabled: false, profilingMode: "TOP_N", profilingLimit: 1000,
    defaultOwnerUserId: null, defaultBizStewardId: null, defaultTechStewardId: null,
  };
}

export async function saveCrawlConfig(
  connectionId: number,
  cfg: Omit<CrawlConfig, "configId" | "connectionId">,
): Promise<void> {
  await sql`
    INSERT INTO bayanat.crawl_config
      (connection_id, schema_include_list, schema_exclude_list, table_exclude_patterns,
       profiling_enabled, profiling_mode, profiling_limit,
       default_owner_user_id, default_biz_steward_id, default_tech_steward_id,
       updated_at)
    VALUES
      (${connectionId},
       ${cfg.schemaIncludeList ?? null},
       ${cfg.schemaExcludeList},
       ${cfg.tableExcludePatterns},
       ${cfg.profilingEnabled},
       ${cfg.profilingMode},
       ${cfg.profilingLimit},
       ${cfg.defaultOwnerUserId   ?? null},
       ${cfg.defaultBizStewardId  ?? null},
       ${cfg.defaultTechStewardId ?? null},
       NOW())
    ON CONFLICT (connection_id) DO UPDATE SET
      schema_include_list       = EXCLUDED.schema_include_list,
      schema_exclude_list       = EXCLUDED.schema_exclude_list,
      table_exclude_patterns    = EXCLUDED.table_exclude_patterns,
      profiling_enabled         = EXCLUDED.profiling_enabled,
      profiling_mode            = EXCLUDED.profiling_mode,
      profiling_limit           = EXCLUDED.profiling_limit,
      default_owner_user_id     = EXCLUDED.default_owner_user_id,
      default_biz_steward_id    = EXCLUDED.default_biz_steward_id,
      default_tech_steward_id   = EXCLUDED.default_tech_steward_id,
      updated_at                = NOW()
  `;
}

export type DataSourceConnection = {
  connectionId:        number;
  connectionName:      string;
  dbTypeCode:          string;
  hostAddress:         string;
  portNumber:          number;
  databaseName:        string | null;
  serviceName:         string | null;
  defaultSchema:       string | null;
  usernameText:        string | null;
  passwordText:        string | null;
  sslEnabled:          boolean;
  isActiveBoolean:     boolean;
  connectionStatus:    string;
  lastTestedAt:        string | null;
  crawlStatus:         string;
  crawlErrorText:      string | null;
  crawledSchemaCount:  number;
  crawledTableCount:   number;
  crawledColumnCount:  number;
  lastDiscoveryTimestamp: string | null;
  createdAtTimestamp:  string;
};

const COLS = sql.unsafe(`
  connection_id                   AS "connectionId",
  connection_name                 AS "connectionName",
  db_type_code                    AS "dbTypeCode",
  host_address                    AS "hostAddress",
  port_number                     AS "portNumber",
  database_name                   AS "databaseName",
  service_name                    AS "serviceName",
  default_schema                  AS "defaultSchema",
  username_text                   AS "usernameText",
  password_text                   AS "passwordText",
  coalesce(ssl_enabled, false)    AS "sslEnabled",
  coalesce(is_active_boolean,true) AS "isActiveBoolean",
  coalesce(connection_status,'UNCHECKED') AS "connectionStatus",
  last_tested_at::text            AS "lastTestedAt",
  coalesce(crawl_status,'IDLE')   AS "crawlStatus",
  crawl_error_text                AS "crawlErrorText",
  coalesce(crawled_schema_count,0) AS "crawledSchemaCount",
  coalesce(crawled_table_count,0)  AS "crawledTableCount",
  coalesce(crawled_column_count,0) AS "crawledColumnCount",
  last_discovery_timestamp::text  AS "lastDiscoveryTimestamp",
  created_at_timestamp::text      AS "createdAtTimestamp"
`);

export async function listConnections(): Promise<DataSourceConnection[]> {
  return sql<DataSourceConnection[]>`SELECT ${COLS} FROM bayanat.connection_registry ORDER BY connection_name`;
}

export async function getConnection(connectionId: number): Promise<DataSourceConnection | null> {
  const rows = await sql<DataSourceConnection[]>`SELECT ${COLS} FROM bayanat.connection_registry WHERE connection_id = ${connectionId}`;
  return rows[0] ?? null;
}

export async function getConnectionPassword(connectionId: number): Promise<string | null> {
  const [row] = await sql<{ p: string | null }[]>`SELECT password_text AS p FROM bayanat.connection_registry WHERE connection_id = ${connectionId}`;
  return row?.p ?? null;
}

export async function createConnection(data: {
  connectionName: string; dbTypeCode: string; hostAddress: string; portNumber: number;
  databaseName: string | null; serviceName: string | null; defaultSchema: string | null;
  usernameText: string | null; passwordText: string | null; sslEnabled: boolean;
}): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.connection_registry
      (connection_name, db_type_code, host_address, port_number, database_name, service_name,
       default_schema, username_text, password_text, ssl_enabled)
    VALUES (
      ${data.connectionName}, ${data.dbTypeCode}, ${data.hostAddress}, ${data.portNumber},
      ${data.databaseName ?? null}, ${data.serviceName ?? null}, ${data.defaultSchema ?? null},
      ${data.usernameText ?? null}, ${data.passwordText ?? null}, ${data.sslEnabled}
    )
    RETURNING connection_id AS id
  `;
  return row.id;
}

export async function updateConnection(connectionId: number, data: {
  connectionName?: string; dbTypeCode?: string; hostAddress?: string; portNumber?: number;
  databaseName?: string | null; serviceName?: string | null; defaultSchema?: string | null;
  usernameText?: string | null; passwordText?: string | null; sslEnabled?: boolean;
  isActiveBoolean?: boolean;
}): Promise<void> {
  await sql`
    UPDATE bayanat.connection_registry SET
      connection_name  = coalesce(${data.connectionName  ?? null}, connection_name),
      db_type_code     = coalesce(${data.dbTypeCode      ?? null}, db_type_code),
      host_address     = coalesce(${data.hostAddress     ?? null}, host_address),
      port_number      = coalesce(${data.portNumber      ?? null}, port_number),
      database_name    = coalesce(${data.databaseName    ?? null}, database_name),
      service_name     = coalesce(${data.serviceName     ?? null}, service_name),
      default_schema   = coalesce(${data.defaultSchema   ?? null}, default_schema),
      username_text    = coalesce(${data.usernameText    ?? null}, username_text),
      ssl_enabled      = coalesce(${data.sslEnabled      ?? null}, ssl_enabled),
      is_active_boolean= coalesce(${data.isActiveBoolean ?? null}, is_active_boolean),
      password_text    = CASE WHEN ${data.passwordText ?? null} IS NOT NULL THEN ${data.passwordText ?? null} ELSE password_text END
    WHERE connection_id = ${connectionId}
  `;
}

export async function deleteConnection(connectionId: number): Promise<void> {
  // Remove linked catalog data first
  await sql`
    DELETE FROM bayanat.data_schemas WHERE data_source_id IN (
      SELECT data_source_id FROM bayanat.data_sources WHERE connection_id = ${connectionId}
    )
  `;
  await sql`DELETE FROM bayanat.data_sources WHERE connection_id = ${connectionId}`;
  await sql`DELETE FROM bayanat.connection_registry WHERE connection_id = ${connectionId}`;
}

export async function updateConnectionStatus(
  connectionId: number, status: "OK" | "FAILED" | "UNCHECKED" | "TESTING",
): Promise<void> {
  await sql`
    UPDATE bayanat.connection_registry
    SET connection_status = ${status}, last_tested_at = NOW()
    WHERE connection_id = ${connectionId}
  `;
}

export async function updateCrawlStatus(
  connectionId: number,
  status: "IDLE" | "CRAWLING" | "COMPLETED" | "FAILED",
  error?: string,
  counts?: { schemas: number; tables: number; columns: number },
): Promise<void> {
  await sql`
    UPDATE bayanat.connection_registry SET
      crawl_status          = ${status},
      crawl_error_text      = ${error ?? null},
      crawled_schema_count  = ${counts?.schemas ?? sql`crawled_schema_count`},
      crawled_table_count   = ${counts?.tables  ?? sql`crawled_table_count`},
      crawled_column_count  = ${counts?.columns ?? sql`crawled_column_count`},
      last_discovery_timestamp = CASE WHEN ${status} = 'COMPLETED' THEN NOW() ELSE last_discovery_timestamp END
    WHERE connection_id = ${connectionId}
  `;
}
