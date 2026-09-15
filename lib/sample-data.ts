import postgres from "postgres";
import { sql } from "./db";

// Live "SELECT * ... LIMIT N" preview for the Sample Data tab. Only wired up
// for POSTGRES sources that have a real bayanat.connection_registry row (the
// crawler's own connection info) — every other source type/registration keeps
// showing the existing "requires a direct connection" placeholder, since this
// platform otherwise only stores crawled metadata, not a live data link.

type EntityConn = {
  entityName: string;
  schemaName: string | null;
  dbTypeCode: string | null;
  hostAddress: string | null;
  portNumber: number | null;
  databaseName: string | null;
  usernameText: string | null;
  passwordText: string | null;
  sslEnabled: boolean;
};

async function getEntityConnectionInfo(entityId: number): Promise<EntityConn | null> {
  const [row] = await sql<EntityConn[]>`
    SELECT
      e.entity_name_text   AS "entityName",
      s.schema_name_text   AS "schemaName",
      cr.db_type_code      AS "dbTypeCode",
      cr.host_address      AS "hostAddress",
      cr.port_number       AS "portNumber",
      cr.database_name     AS "databaseName",
      cr.username_text     AS "usernameText",
      cr.password_text     AS "passwordText",
      coalesce(cr.ssl_enabled, false) AS "sslEnabled"
    FROM bayanat.data_entities e
    LEFT JOIN bayanat.data_schemas s  ON s.schema_id = e.schema_id
    LEFT JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    LEFT JOIN bayanat.connection_registry cr ON cr.connection_id = ds.connection_id
    WHERE e.entity_id = ${entityId}
  `;
  return row ?? null;
}

export function isLiveQueryable(conn: EntityConn | null): conn is EntityConn & { hostAddress: string; portNumber: number; schemaName: string } {
  return !!conn && conn.dbTypeCode === "POSTGRES" && !!conn.hostAddress && conn.portNumber != null && !!conn.schemaName;
}

export type SampleDataResult =
  | { live: true; columns: string[]; rows: Record<string, unknown>[] }
  | { live: false; reason: string };

// Which physical column names on this table are flagged PII via the linked
// CLASSIFICATION business term — the same source of truth ColumnsTable.tsx
// already renders as the "PII" badge (attr.classTermIsPii).
export async function getPiColumnNames(entityId: number): Promise<Set<string>> {
  const rows = await sql<{ physicalName: string }[]>`
    SELECT a.physical_name_text AS "physicalName"
    FROM bayanat.data_attributes a
    JOIN bayanat.asset_business_terms abt
      ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
    JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
    WHERE a.entity_id = ${entityId} AND bg.is_pii_indicator = true
  `;
  return new Set(rows.map((r) => r.physicalName));
}

export async function getLiveSampleRows(entityId: number, limit: number): Promise<SampleDataResult> {
  const conn = await getEntityConnectionInfo(entityId);
  if (!isLiveQueryable(conn)) {
    return { live: false, reason: "This source has no live database connection — sample data preview isn't available." };
  }

  const qs = `"${conn.schemaName.replace(/"/g, '""')}"."${conn.entityName.replace(/"/g, '""')}"`;
  const pg = postgres({
    host: conn.hostAddress, port: conn.portNumber,
    database: conn.databaseName || "postgres",
    username: conn.usernameText || undefined,
    password: conn.passwordText || undefined,
    ssl: conn.sslEnabled ? "require" : false,
    max: 1, connect_timeout: 10, idle_timeout: 5,
  });
  try {
    const rows = await pg.unsafe(`SELECT * FROM ${qs} LIMIT ${limit}`);
    const columns = rows.columns?.map((c) => c.name) ?? (rows[0] ? Object.keys(rows[0]) : []);
    return { live: true, columns, rows: rows as unknown as Record<string, unknown>[] };
  } catch (e) {
    return { live: false, reason: `Could not reach the live source: ${(e as Error).message}` };
  } finally {
    await pg.end({ timeout: 5 });
  }
}
