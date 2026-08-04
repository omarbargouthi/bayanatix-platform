import postgres from "postgres";

// Separate connection authenticated as bayanatix_kpi_readonly (see db/071_reports_extended.sql)
// — a Postgres role with SELECT-only grants on the bayanat schema and a 3s statement_timeout.
// THIS ROLE is the actual security boundary for admin-authored custom KPIs; validateKpiSql
// below is a fail-fast UX layer on top of it, not the guarantee itself — even a query that
// slips past validation still can't write, alter, or drop anything when run through this client.
const sandboxSql =
  global.__kpiSandboxSql ??
  postgres(process.env.KPI_SANDBOX_DATABASE_URL ?? "postgres://invalid", {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: process.env.KPI_SANDBOX_DATABASE_URL?.includes("sslmode=require") ? "require" : "prefer",
    types: { bigint: postgres.BigInt },
  });

declare global {
  // eslint-disable-next-line no-var
  var __kpiSandboxSql: ReturnType<typeof postgres> | undefined;
}
if (process.env.NODE_ENV !== "production") global.__kpiSandboxSql = sandboxSql;

const FORBIDDEN_KEYWORDS = [
  "insert", "update", "delete", "drop", "alter", "create", "grant", "revoke", "truncate",
  "copy", "call", "do", "execute", "vacuum", "reindex", "lock", "listen", "notify",
  "pg_sleep", "pg_read_file", "pg_terminate_backend", "pg_cancel_backend", "set_config",
];

export type SqlValidationResult = { ok: true } | { ok: false; reason: string };

// Fail-fast checks: must be a single SELECT (or WITH ... SELECT), no stacked
// statements, no writes/DDL/DCL/admin-function keywords. This is defense-in-depth
// on top of the read-only role, not a substitute for it — see module comment above.
export function validateKpiSql(rawSql: string): SqlValidationResult {
  const trimmed = rawSql.trim().replace(/;+\s*$/, "");
  if (trimmed.length === 0) return { ok: false, reason: "SQL cannot be empty." };
  if (trimmed.includes(";")) return { ok: false, reason: "Only a single statement is allowed (no semicolons)." };

  const firstWord = trimmed.match(/^\s*(\w+)/)?.[1]?.toLowerCase();
  if (firstWord !== "select" && firstWord !== "with") {
    return { ok: false, reason: "Query must start with SELECT or WITH." };
  }

  const lower = trimmed.toLowerCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`(^|[^a-z_])${kw}([^a-z_]|$)`, "i").test(lower)) {
      return { ok: false, reason: `Query contains a disallowed keyword: "${kw}".` };
    }
  }

  return { ok: true };
}

export type CustomKpiResult = { value: number; error?: string };

// Wraps the user's query so the contract is enforced regardless of what it selects:
// exactly one row, one numeric "value" column. No breakdown, no filter substitution —
// see the plan notes on v1 scope for custom KPIs.
export async function runCustomKpiSql(rawSql: string): Promise<CustomKpiResult> {
  const validation = validateKpiSql(rawSql);
  if (!validation.ok) return { value: 0, error: validation.reason };

  try {
    const rows = await sandboxSql.unsafe(`SELECT (q.value)::numeric AS value FROM (${rawSql}) AS q LIMIT 1`);
    const value = rows[0]?.value;
    return { value: value != null ? Number(value) : 0 };
  } catch (err) {
    return { value: 0, error: err instanceof Error ? err.message : "Query failed." };
  }
}
