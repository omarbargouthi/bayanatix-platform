import postgres from "postgres";
import { openSecret } from "./secrets";
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
  if (row) row.passwordText = openSecret(row.passwordText);
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

export type AffectedRowEstimate =
  | { available: true; count: number }
  | { available: false; reason: string };

// Live COUNT(*) under an OR'd set of column=value conditions — used by Legal
// Hold's driving-table conditions to show an estimated affected-record count.
// Same live-connection limitation as getLiveSampleRows (POSTGRES + a real
// connection_registry row only). Column names come from our own catalog
// (data_attributes.physical_name_text, not user input) so they're quoted as
// identifiers; condition values are user-entered and passed as bound
// parameters, never string-interpolated into the query.
// Whitelisted operator -> SQL fragment. Every branch consumes exactly the
// number of $-placeholders it declares (0, 1, or 2 for BETWEEN) so the
// caller can keep a single running placeholder counter across conditions.
function operatorSql(op: string, col: string, i: number): { sql: string; paramCount: number } {
  switch (op) {
    case "NOT_EQUALS":       return { sql: `${col} <> $${i}`, paramCount: 1 };
    case "GREATER_THAN":     return { sql: `${col} > $${i}`, paramCount: 1 };
    case "GREATER_OR_EQUAL": return { sql: `${col} >= $${i}`, paramCount: 1 };
    case "LESS_THAN":        return { sql: `${col} < $${i}`, paramCount: 1 };
    case "LESS_OR_EQUAL":    return { sql: `${col} <= $${i}`, paramCount: 1 };
    case "BETWEEN":          return { sql: `${col} BETWEEN $${i} AND $${i + 1}`, paramCount: 2 };
    case "CONTAINS":         return { sql: `${col}::text ILIKE '%' || $${i} || '%'`, paramCount: 1 };
    case "IN_LIST":          return { sql: `${col}::text = ANY(string_to_array($${i}, ','))`, paramCount: 1 };
    case "IS_NULL":          return { sql: `${col} IS NULL`, paramCount: 0 };
    case "IS_NOT_NULL":      return { sql: `${col} IS NOT NULL`, paramCount: 0 };
    case "EQUALS":
    default:                 return { sql: `${col} = $${i}`, paramCount: 1 };
  }
}

// postgres.js sends a plain JS string parameter compared against a boolean
// column in a way Postgres does NOT coerce the way it does for numeric/date
// columns (verified live: `is_active = $1` with $1 bound to the STRING
// "true" silently matches nothing, even though `is_active = true` — a real
// boolean literal, or a real JS `true` param — correctly matches). So a
// boolean-family value must be converted to an actual JS boolean before it's
// pushed into the params array, not left as the text the condition UI stores.
function isBooleanDataType(dataType: string): boolean {
  return dataType.toLowerCase().includes("bool");
}
function toBoolean(valueText: string): boolean {
  return /^(true|1|yes|y)$/i.test(valueText.trim());
}

export async function estimateAffectedRowCount(
  entityId: number,
  conditions: {
    attributeId: number; attributeName: string; valueText: string; valueText2?: string | null;
    operator?: string; logicOperator?: "AND" | "OR";
  }[],
): Promise<AffectedRowEstimate> {
  if (conditions.length === 0) return { available: true, count: 0 };

  const conn = await getEntityConnectionInfo(entityId);
  if (!isLiveQueryable(conn)) {
    return { available: false, reason: "This source has no live database connection — no estimate available." };
  }

  const qs = `"${conn.schemaName.replace(/"/g, '""')}"."${conn.entityName.replace(/"/g, '""')}"`;

  const typeRows = await sql<{ attributeId: number; dataType: string }[]>`
    SELECT attribute_id AS "attributeId", data_type_text AS "dataType"
    FROM bayanat.data_attributes WHERE attribute_id IN ${sql(conditions.map((c) => c.attributeId))}
  `;
  const dataTypeById = new Map(typeRows.map((r) => [r.attributeId, r.dataType]));

  // Explicit left fold — ((cond1) OR (cond2)) AND (cond3) — rather than
  // relying on flat SQL AND/OR precedence, so the UI's "in order, left to
  // right" chain is literally what executes.
  const values: (string | boolean)[] = [];
  let whereSql = "";
  for (const c of conditions) {
    const col = `"${c.attributeName.replace(/"/g, '""')}"`;
    const isBool = isBooleanDataType(dataTypeById.get(c.attributeId) ?? "");
    const { sql: fragment, paramCount } = operatorSql(c.operator ?? "EQUALS", col, values.length + 1);
    if (paramCount >= 1) values.push(isBool ? toBoolean(c.valueText) : c.valueText);
    if (paramCount >= 2) values.push(isBool ? toBoolean(c.valueText2 ?? "") : (c.valueText2 ?? ""));
    whereSql = whereSql === "" ? `(${fragment})` : `(${whereSql} ${c.logicOperator ?? "OR"} (${fragment}))`;
  }

  const pg = postgres({
    host: conn.hostAddress, port: conn.portNumber,
    database: conn.databaseName || "postgres",
    username: conn.usernameText || undefined,
    password: conn.passwordText || undefined,
    ssl: conn.sslEnabled ? "require" : false,
    max: 1, connect_timeout: 10, idle_timeout: 5,
  });
  try {
    const rows = await pg.unsafe(`SELECT COUNT(*)::int AS cnt FROM ${qs} WHERE ${whereSql}`, values);
    const first = rows[0] as unknown as { cnt: number } | undefined;
    return { available: true, count: first?.cnt ?? 0 };
  } catch (e) {
    return { available: false, reason: `Could not reach the live source: ${(e as Error).message}` };
  } finally {
    await pg.end({ timeout: 5 });
  }
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
