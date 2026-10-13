import { sql } from "../db";
import { sealSecret, openSecret } from "../secrets";

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
  // Standard 5-field cron expression — checked by /api/admin/sources/scheduled-crawl
  // (a standalone node-cron process ticks that route, same convention as the
  // existing PBIX scheduler). Null = manual crawl only, no automatic schedule.
  scheduleCron: string | null;
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
           default_tech_steward_id AS "defaultTechStewardId",
           schedule_cron            AS "scheduleCron"
    FROM bayanat.crawl_config WHERE connection_id = ${connectionId}
  `;
  return rows[0] ?? {
    configId: null, connectionId,
    schemaIncludeList: null, schemaExcludeList: [], tableExcludePatterns: [],
    profilingEnabled: false, profilingMode: "TOP_N", profilingLimit: 1000,
    defaultOwnerUserId: null, defaultBizStewardId: null, defaultTechStewardId: null,
    scheduleCron: null,
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
       schedule_cron, updated_at)
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
       ${cfg.scheduleCron ?? null},
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
      schedule_cron              = EXCLUDED.schedule_cron,
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
  lineageEnabled:        boolean;
  lineageScanViews:      boolean;
  lineageScanMatviews:   boolean;
  lineageScanProcedures: boolean;
  lineageScanFunctions:  boolean;
  /** The catalog-facing bayanat.data_sources row for this connection, if one
   *  exists yet (created on first crawl) — null before that. This is the id
   *  the rest of the app means by asset_type_code='DATA_SOURCES' (asset_tags,
   *  stakeholders, custom attributes, ...), distinct from connectionId. */
  dataSourceId: number | null;
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
  created_at_timestamp::text      AS "createdAtTimestamp",
  coalesce(lineage_enabled, false)         AS "lineageEnabled",
  coalesce(lineage_scan_views, true)       AS "lineageScanViews",
  coalesce(lineage_scan_matviews, true)    AS "lineageScanMatviews",
  coalesce(lineage_scan_procedures, true)  AS "lineageScanProcedures",
  coalesce(lineage_scan_functions, true)   AS "lineageScanFunctions",
  (SELECT ds.data_source_id FROM bayanat.data_sources ds
   WHERE ds.connection_id = connection_registry.connection_id LIMIT 1) AS "dataSourceId"
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
  return openSecret(row?.p ?? null);
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
      ${data.usernameText ?? null}, ${sealSecret(data.passwordText ?? null)}, ${data.sslEnabled}
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
  lineageEnabled?: boolean; lineageScanViews?: boolean; lineageScanMatviews?: boolean;
  lineageScanProcedures?: boolean; lineageScanFunctions?: boolean;
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
      password_text    = CASE WHEN ${data.passwordText ?? null}::text IS NOT NULL THEN ${sealSecret(data.passwordText ?? null)} ELSE password_text END,
      lineage_enabled        = coalesce(${data.lineageEnabled        ?? null}, lineage_enabled),
      lineage_scan_views      = coalesce(${data.lineageScanViews      ?? null}, lineage_scan_views),
      lineage_scan_matviews   = coalesce(${data.lineageScanMatviews   ?? null}, lineage_scan_matviews),
      lineage_scan_procedures = coalesce(${data.lineageScanProcedures ?? null}, lineage_scan_procedures),
      lineage_scan_functions  = coalesce(${data.lineageScanFunctions  ?? null}, lineage_scan_functions)
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
  // An Azure Data Factory / Synapse connection owns lineage, not tables: its pipelines,
  // data flows and notebooks (lineage processes) and the links they produced go with it.
  await sql`
    DELETE FROM bayanat.data_lineage WHERE provenance_code = 'SCANNED' AND process_id IN (
      SELECT process_id FROM bayanat.lineage_processes
      WHERE connection_id = ${connectionId} AND (starts_with(process_type_code, 'ADF_') OR starts_with(process_type_code, 'SYNAPSE_'))
    )
  `;
  await sql`
    DELETE FROM bayanat.lineage_processes
    WHERE connection_id = ${connectionId} AND parent_process_id IS NOT NULL
      AND (starts_with(process_type_code, 'ADF_') OR starts_with(process_type_code, 'SYNAPSE_'))
  `;
  await sql`
    DELETE FROM bayanat.lineage_processes
    WHERE connection_id = ${connectionId} AND (starts_with(process_type_code, 'ADF_') OR starts_with(process_type_code, 'SYNAPSE_'))
  `;
  // …and so do the placeholder tables and files its crawl added for objects it could not
  // find in the catalog, once no lineage link uses them any more.
  const placeholders = await sql<{ entityId: number; schemaId: number }[]>`
    SELECT e.entity_id AS "entityId", e.schema_id AS "schemaId"
    FROM bayanat.data_entities e
    WHERE e.description_text LIKE 'Auto-created by the lineage scanner%'
      AND e.entity_id IN (
        SELECT q.placeholder_entity_id FROM bayanat.lineage_stitch_queue q
        JOIN bayanat.lineage_scan_runs r ON r.scan_run_id = q.scan_run_id
        WHERE r.connection_id = ${connectionId} AND q.status_code = 'OPEN')
      AND NOT EXISTS (
        SELECT 1 FROM bayanat.data_lineage l
        WHERE l.lineage_scope_code = 'ENTITY_LEVEL' AND (l.source_asset_id = e.entity_id OR l.target_asset_id = e.entity_id))
      AND NOT EXISTS (
        SELECT 1 FROM bayanat.data_lineage l
        JOIN bayanat.data_attributes a ON a.attribute_id IN (l.source_asset_id, l.target_asset_id)
        WHERE l.lineage_scope_code = 'ATTRIBUTE_LEVEL' AND a.entity_id = e.entity_id)
  `;
  for (const p of placeholders) {
    try {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM bayanat.lineage_stitch_queue WHERE placeholder_entity_id = ${p.entityId}`;
        await tx`DELETE FROM bayanat.data_entities WHERE entity_id = ${p.entityId}`;
        await tx`
          DELETE FROM bayanat.data_schemas s WHERE s.schema_id = ${p.schemaId}
            AND NOT EXISTS (SELECT 1 FROM bayanat.data_entities e WHERE e.schema_id = s.schema_id)
        `;
        await tx`
          DELETE FROM bayanat.data_sources ds
          WHERE ds.connection_id IS NULL AND ds.description_text LIKE 'Auto-created%'
            AND NOT EXISTS (SELECT 1 FROM bayanat.data_schemas s WHERE s.data_source_id = ds.data_source_id)
        `;
      });
    } catch { /* something else refers to it now — it stays for Stitching Review */ }
  }
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
