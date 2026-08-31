import postgres from "postgres";
import { createHash } from "node:crypto";
import { parse as pgParse } from "libpg-query";
import { sql } from "./db";
import { ensureSchema, ensureEntity, ensureAttribute } from "./lineage/catalog-upsert";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProcessTypeCode = "PROCEDURE" | "FUNCTION" | "VIEW" | "MATVIEW";
type TransformationTypeCode = "DIRECT" | "EXPRESSION" | "AGGREGATION" | "JOIN" | "FILTER" | "CAST" | "LOOKUP" | "MANUAL" | "UNKNOWN";
type ConfidenceCode = "HIGH" | "MEDIUM" | "LOW";

type SourceObject = {
  schemaName: string;
  objectName: string;
  processType: ProcessTypeCode;
  definitionText: string;   // for views: the SELECT body; for routines: the full function/procedure body
};

type ColumnRefFound = { table: string | null; column: string };

type ExtractedMapping = {
  targetColumn: string;
  sources: ColumnRefFound[];
  transformationType: TransformationTypeCode;
  confidence: ConfidenceCode;
  logicText: string;
};

export type ScanWarning = { object: string; message: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgNode = any;

const AGGREGATE_FUNCS = new Set(["sum", "count", "avg", "min", "max", "array_agg", "string_agg", "bool_and", "bool_or", "stddev", "variance"]);

// ── Statement splitting (for plpgsql routine bodies) ────────────────────────

// BEGIN/DECLARE/EXCEPTION aren't semicolon-terminated in plpgsql, so without
// injecting a boundary after them they merge with the following real
// statement and the whole chunk fails to parse as SQL. Per FR-1.5: "parse
// each SQL statement; ignore control flow, treat statements independently."
const BLOCK_KEYWORDS = /\b(BEGIN|DECLARE|EXCEPTION)\b/gi;

export function splitStatements(text: string): string[] {
  const withBoundaries = text.replace(BLOCK_KEYWORDS, (m) => m + ";");
  const stmts: string[] = [];
  let depth = 0, inSingle = false, inDouble = false, dollarTag: string | null = null, start = 0;
  let inLineComment = false, inBlockComment = false;
  const t = withBoundaries;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inLineComment) { if (c === "\n") inLineComment = false; continue; }
    if (inBlockComment) { if (c === "*" && t[i + 1] === "/") { i++; inBlockComment = false; } continue; }
    if (dollarTag) {
      if (t.startsWith(dollarTag, i)) { i += dollarTag.length - 1; dollarTag = null; }
      continue;
    }
    if (inSingle) { if (c === "'" && t[i + 1] === "'") { i++; } else if (c === "'") inSingle = false; continue; }
    if (inDouble) { if (c === '"') inDouble = false; continue; }
    if (c === "-" && t[i + 1] === "-") { inLineComment = true; i++; continue; }
    if (c === "/" && t[i + 1] === "*") { inBlockComment = true; i++; continue; }
    if (c === "'") { inSingle = true; continue; }
    if (c === '"') { inDouble = true; continue; }
    if (c === "$") {
      const m = /^\$[a-zA-Z_]*\$/.exec(t.slice(i));
      if (m) { dollarTag = m[0]; i += m[0].length - 1; continue; }
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === ";" && depth === 0) {
      const chunk = t.slice(start, i).trim();
      if (chunk) stmts.push(chunk);
      start = i + 1;
    }
  }
  const tail = t.slice(start).trim();
  if (tail) stmts.push(tail);
  return stmts;
}

function hasDynamicSql(text: string): boolean {
  return /\bEXECUTE\s+(format|'|")/i.test(text) || /\bEXECUTE\s+\w+\s*\|\|/i.test(text);
}

// pg_get_functiondef() returns the *entire* CREATE [OR REPLACE] {FUNCTION|PROCEDURE}
// ... AS $tag$ <body> $tag$ statement, not just the body — the body itself is a
// dollar-quoted string literal from the outer statement's point of view. Pull out
// just the <body> so splitStatements() sees plpgsql content, not a CREATE wrapper
// (whose own body dollar-quote would otherwise be swallowed whole as one opaque
// string by the splitter's own dollar-quote handling).
function extractRoutineBody(definitionText: string): string {
  const m = /\bAS\s+(\$[a-zA-Z_]*\$)([\s\S]*)\1\s*;?\s*$/i.exec(definitionText);
  return m ? m[2] : definitionText;
}

// ── AST helpers ──────────────────────────────────────────────────────────────

// Walk a FROM clause (RangeVar / JoinExpr tree) collecting alias -> table name,
// plus the set of aliases reached only via a JOIN branch (vs. the primary table).
function collectAliasMap(fromClause: PgNode[]): { aliasToTable: Map<string, string>; joinedAliases: Set<string>; primaryAlias: string | null } {
  const aliasToTable = new Map<string, string>();
  const joinedAliases = new Set<string>();
  let primaryAlias: string | null = null;

  function visitRangeVar(rv: PgNode, isJoined: boolean) {
    const table = rv.relname as string;
    const alias = rv.alias?.aliasname ?? table;
    aliasToTable.set(alias, table);
    if (isJoined) joinedAliases.add(alias);
    else if (primaryAlias === null) primaryAlias = alias;
  }

  function visit(node: PgNode, isJoined: boolean) {
    if (!node) return;
    if (node.RangeVar) { visitRangeVar(node.RangeVar, isJoined); return; }
    if (node.JoinExpr) {
      const j = node.JoinExpr;
      visit(j.larg, isJoined); // left side inherits current joined-ness (primary table stays primary)
      visit(j.rarg, true);     // right side of a join is always "joined-in"
      return;
    }
    if (node.RangeSubselect) return; // subqueries in FROM: not resolved in v1 — see extractSelectLineage warnings
  }

  for (const entry of fromClause ?? []) visit(entry, false);
  return { aliasToTable, joinedAliases, primaryAlias };
}

// Recursively collect every ColumnRef leaf under an expression node.
function collectColumnRefs(node: PgNode, out: ColumnRefFound[] = []): ColumnRefFound[] {
  if (!node || typeof node !== "object") return out;

  if (node.ColumnRef) {
    const fields = node.ColumnRef.fields ?? [];
    if (fields.some((f: PgNode) => f.A_Star)) return out; // SELECT * handled separately
    const names = fields.filter((f: PgNode) => f.String).map((f: PgNode) => f.String.sval as string);
    if (names.length === 2) out.push({ table: names[0], column: names[1] });
    else if (names.length === 1) out.push({ table: null, column: names[0] });
    return out;
  }

  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) val.forEach((v) => collectColumnRefs(v, out));
    else if (val && typeof val === "object") collectColumnRefs(val, out);
  }
  return out;
}

function isBareColumnRef(node: PgNode): boolean {
  return !!node?.ColumnRef && (node.ColumnRef.fields ?? []).every((f: PgNode) => f.String);
}

function isStarRef(node: PgNode): boolean {
  const fields = node?.ColumnRef?.fields ?? [];
  return fields.some((f: PgNode) => f.A_Star);
}

function containsAggregate(node: PgNode): boolean {
  if (!node || typeof node !== "object") return false;
  if (node.FuncCall) {
    const fname = (node.FuncCall.funcname ?? []).map((f: PgNode) => f.String?.sval).pop();
    if (fname && AGGREGATE_FUNCS.has(String(fname).toLowerCase())) return true;
  }
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) { if (val.some(containsAggregate)) return true; }
    else if (val && typeof val === "object") { if (containsAggregate(val)) return true; }
  }
  return false;
}

// Best-effort source-text snippet for an expression: from its location to the
// start of the next target-list item (or end of string), trimmed of a
// trailing comma. libpg-query doesn't expose a deparser, so this is a
// substring of the original statement rather than a pretty-printed AST.
function snippetFor(stmtText: string, startLoc: number, nextLoc: number | null): string {
  const end = nextLoc ?? stmtText.length;
  // nextLoc for the last target-list item is the FROM clause's first *identifier*
  // location, not the FROM keyword itself, so the keyword is still in-range — strip it.
  return stmtText.slice(startLoc, end).replace(/,\s*$/, "").replace(/\bFROM\s*$/i, "").trim();
}

function resolveTable(ref: ColumnRefFound, aliasToTable: Map<string, string>, primaryAlias: string | null): { table: string | null; ambiguous: boolean } {
  if (ref.table) return { table: aliasToTable.get(ref.table) ?? ref.table, ambiguous: false };
  // Unqualified column: attribute to the primary table if there's only one source table overall.
  if (aliasToTable.size === 1) return { table: [...aliasToTable.values()][0], ambiguous: false };
  if (primaryAlias) return { table: aliasToTable.get(primaryAlias) ?? null, ambiguous: true };
  return { table: null, ambiguous: true };
}

// Smallest `location` offset anywhere in a subtree — used to cap the last
// target-list item's snippet at the start of the FROM clause instead of
// running to the end of the statement text.
function minLocation(node: PgNode): number | null {
  if (!node || typeof node !== "object") return null;
  let best: number | null = typeof node.location === "number" ? node.location : null;
  for (const key of Object.keys(node)) {
    if (key === "location") continue;
    const val = node[key];
    const consider = (v: PgNode) => {
      const loc = minLocation(v);
      if (loc !== null && (best === null || loc < best)) best = loc;
    };
    if (Array.isArray(val)) val.forEach(consider);
    else if (val && typeof val === "object") consider(val);
  }
  return best;
}

// ── Column-lineage extraction from a SELECT ─────────────────────────────────

function extractSelectLineage(
  selectStmt: PgNode,
  stmtText: string,
  targetColumnNames: string[] | null, // for INSERT INTO t (cols) SELECT ... — positional mapping
  warnings: string[],
): ExtractedMapping[] {
  const targetList: PgNode[] = selectStmt.targetList ?? [];
  const { aliasToTable, joinedAliases, primaryAlias } = collectAliasMap(selectStmt.fromClause ?? []);
  const mappings: ExtractedMapping[] = [];
  const fromClauseLoc = (selectStmt.fromClause ?? []).length > 0 ? minLocation(selectStmt.fromClause) : null;

  targetList.forEach((rt, idx) => {
    const resTarget = rt.ResTarget;
    const val = resTarget.val;
    const startLoc: number = resTarget.location ?? 0;
    const nextLoc: number | null = targetList[idx + 1]?.ResTarget?.location ?? fromClauseLoc;
    const logicText = snippetFor(stmtText, startLoc, nextLoc);

    if (isStarRef(val)) {
      // SELECT * — can't expand without catalog knowledge of the source table's columns;
      // the caller (scan orchestrator) resolves this against the catalog when possible.
      mappings.push({
        targetColumn: "*",
        sources: [{ table: aliasToTable.size === 1 ? [...aliasToTable.values()][0] : null, column: "*" }],
        transformationType: "UNKNOWN",
        confidence: "LOW",
        logicText,
      });
      return;
    }

    const outputName = targetColumnNames?.[idx] ?? resTarget.name ?? (isBareColumnRef(val) ? val.ColumnRef.fields.at(-1).String.sval : `col_${idx + 1}`);

    const refs = collectColumnRefs(val);
    const resolvedSources = refs
      .map((r) => ({ ...resolveTable(r, aliasToTable, primaryAlias), column: r.column }))
      .filter((r) => r.table !== null) as { table: string; column: string; ambiguous: boolean }[];

    if (resolvedSources.length === 0) {
      mappings.push({ targetColumn: outputName, sources: [], transformationType: "UNKNOWN", confidence: "LOW", logicText });
      return;
    }

    const distinctTables = new Set(resolvedSources.map((r) => r.table));
    const anyAmbiguous = resolvedSources.some((r) => r.ambiguous);
    const sourcesForMapping: ColumnRefFound[] = resolvedSources.map((r) => ({ table: r.table, column: r.column }));

    let type: TransformationTypeCode;
    let confidence: ConfidenceCode;

    if (isBareColumnRef(val)) {
      const refAlias = val.ColumnRef.fields.length === 2 ? val.ColumnRef.fields[0].String.sval : primaryAlias;
      type = refAlias && joinedAliases.has(refAlias) ? "JOIN" : "DIRECT";
      confidence = anyAmbiguous ? "MEDIUM" : "HIGH";
    } else if (val.TypeCast && isBareColumnRef(val.TypeCast.arg)) {
      type = "CAST";
      confidence = anyAmbiguous ? "MEDIUM" : "HIGH";
    } else if (containsAggregate(val)) {
      type = "AGGREGATION";
      confidence = resolvedSources.length > 1 || anyAmbiguous ? "MEDIUM" : "HIGH";
    } else {
      type = "EXPRESSION";
      confidence = distinctTables.size > 1 || anyAmbiguous ? "MEDIUM" : "HIGH";
    }

    mappings.push({ targetColumn: outputName, sources: sourcesForMapping, transformationType: type, confidence, logicText });
  });

  return mappings;
}

// ── Per-statement dispatch ───────────────────────────────────────────────────

type StatementLineage = { targetSchema: string | null; targetTable: string; mappings: ExtractedMapping[] };

function extractFromStatement(
  rawStmt: PgNode,
  stmtText: string,
  warnings: string[],
  // pg_get_viewdef() returns only the bare SELECT, not a CREATE VIEW wrapper —
  // when the source object is known to be a view/matview, the top-level parsed
  // statement is a plain SelectStmt and this hint supplies its implicit target.
  viewTarget: { schemaName: string; tableName: string } | null = null,
): StatementLineage | null {
  if (rawStmt.ViewStmt) {
    const v = rawStmt.ViewStmt;
    const select = v.query?.SelectStmt;
    if (!select) return null;
    return { targetSchema: v.view?.schemaname ?? null, targetTable: v.view.relname, mappings: extractSelectLineage(select, stmtText, null, warnings) };
  }

  if (rawStmt.SelectStmt && viewTarget) {
    return { targetSchema: viewTarget.schemaName, targetTable: viewTarget.tableName, mappings: extractSelectLineage(rawStmt.SelectStmt, stmtText, null, warnings) };
  }

  if (rawStmt.CreateTableAsStmt) {
    const c = rawStmt.CreateTableAsStmt;
    const select = c.query?.SelectStmt;
    const into = c.into?.rel;
    if (!select || !into) return null;
    return { targetSchema: into.schemaname ?? null, targetTable: into.relname, mappings: extractSelectLineage(select, stmtText, null, warnings) };
  }

  if (rawStmt.InsertStmt) {
    const ins = rawStmt.InsertStmt;
    const select = ins.selectStmt?.SelectStmt;
    if (!select) return null; // INSERT ... VALUES (no lineage) — not an error
    const cols: string[] | null = ins.cols ? ins.cols.map((c: PgNode) => c.ResTarget.name) : null;
    return { targetSchema: ins.relation?.schemaname ?? null, targetTable: ins.relation.relname, mappings: extractSelectLineage(select, stmtText, cols, warnings) };
  }

  if (rawStmt.UpdateStmt) {
    const upd = rawStmt.UpdateStmt;
    const targetList: PgNode[] = upd.targetList ?? [];
    const { aliasToTable, joinedAliases, primaryAlias } = collectAliasMap(upd.fromClause ?? []);
    const mappings: ExtractedMapping[] = targetList.map((rt, idx) => {
      const resTarget = rt.ResTarget;
      const startLoc: number = resTarget.location ?? 0;
      const nextLoc: number | null = targetList[idx + 1]?.ResTarget?.location ?? null;
      const logicText = snippetFor(stmtText, startLoc, nextLoc);
      const refs = collectColumnRefs(resTarget.val);
      const resolvedSources = refs
        .map((r) => ({ ...resolveTable(r, aliasToTable, primaryAlias), column: r.column }))
        .filter((r) => r.table !== null) as { table: string; column: string; ambiguous: boolean }[];
      const type: TransformationTypeCode = isBareColumnRef(resTarget.val)
        ? ((resTarget.val.ColumnRef.fields.length === 2 && joinedAliases.has(resTarget.val.ColumnRef.fields[0].String.sval)) ? "JOIN" : "DIRECT")
        : containsAggregate(resTarget.val) ? "AGGREGATION" : "EXPRESSION";
      return {
        targetColumn: resTarget.name,
        sources: resolvedSources.map((r) => ({ table: r.table, column: r.column })),
        transformationType: type,
        confidence: resolvedSources.length > 0 ? (resolvedSources.some((r) => r.ambiguous) ? "MEDIUM" : "HIGH") : "LOW",
        logicText,
      };
    });
    return { targetSchema: upd.relation?.schemaname ?? null, targetTable: upd.relation.relname, mappings };
  }

  // DeleteStmt, TransactionStmt, etc. carry no column lineage — not a warning, just nothing to extract.
  return null;
}

export async function extractLineageFromDefinitionAsync(
  processName: string,
  definitionText: string,
  warnings: ScanWarning[],
  viewTarget: { schemaName: string; tableName: string } | null = null,
): Promise<StatementLineage[]> {
  const results: StatementLineage[] = [];
  for (const stmtText of splitStatements(definitionText)) {
    if (hasDynamicSql(stmtText)) {
      warnings.push({ object: processName, message: `Dynamic SQL skipped: ${stmtText.slice(0, 80)}…` });
      continue;
    }
    let parsed;
    try {
      parsed = await pgParse(stmtText);
    } catch {
      continue; // plpgsql control flow (IF/LOOP/RAISE/etc.) — expected, not a warning
    }
    for (const s of parsed.stmts ?? []) {
      try {
        const lineage = extractFromStatement(s.stmt, stmtText, [], viewTarget);
        if (lineage) results.push(lineage);
      } catch (e) {
        warnings.push({ object: processName, message: `Failed to extract lineage from statement: ${(e as Error).message}` });
      }
    }
  }
  return results;
}

// ── Catalog resolution (idempotent, non-destructive) ────────────────────────
// ensureSchema/ensureEntity/ensureAttribute now live in ./lineage/catalog-upsert
// (extracted so the v2 SSIS/Power BI connectors reuse the exact same upsert
// pattern instead of duplicating it) — imported above.

// ── Scan orchestrator ────────────────────────────────────────────────────────

export async function runLineageScan(connectionId: number, triggeredByUserId: string): Promise<{ scanRunId: number }> {
  const [conn] = await sql<{
    connectionName: string; hostAddress: string; portNumber: number; databaseName: string | null;
    defaultSchema: string | null; usernameText: string | null; passwordText: string | null; sslEnabled: boolean;
    lineageEnabled: boolean; lineageScanViews: boolean; lineageScanMatviews: boolean;
    lineageScanProcedures: boolean; lineageScanFunctions: boolean;
  }[]>`
    SELECT connection_name AS "connectionName", host_address AS "hostAddress", port_number AS "portNumber",
           database_name AS "databaseName", default_schema AS "defaultSchema",
           username_text AS "usernameText", password_text AS "passwordText", ssl_enabled AS "sslEnabled",
           coalesce(lineage_enabled, false)        AS "lineageEnabled",
           coalesce(lineage_scan_views, true)      AS "lineageScanViews",
           coalesce(lineage_scan_matviews, true)   AS "lineageScanMatviews",
           coalesce(lineage_scan_procedures, true) AS "lineageScanProcedures",
           coalesce(lineage_scan_functions, true)  AS "lineageScanFunctions"
    FROM bayanat.connection_registry WHERE connection_id = ${connectionId}
  `;
  if (!conn) throw new Error("Connection not found");
  if (!conn.lineageEnabled) throw new Error("Lineage scanning is not enabled for this connection — enable it under Data Lineage settings first.");

  const [dataSource] = await sql<{ id: number }[]>`
    SELECT data_source_id AS id FROM bayanat.data_sources WHERE connection_id = ${connectionId} LIMIT 1
  `;
  if (!dataSource) throw new Error("No catalog data_source is linked to this connection — crawl it first.");

  const [runRow] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.lineage_scan_runs (connection_id, triggered_by_user_id, status_code)
    VALUES (${connectionId}, ${triggeredByUserId}, 'RUNNING')
    RETURNING scan_run_id AS id
  `;
  const scanRunId = runRow.id;

  const warnings: ScanWarning[] = [];
  let processesScanned = 0, edgesCreated = 0, edgesRemoved = 0;
  const touchedProcessIds: number[] = [];

  const pg = postgres({
    host: conn.hostAddress, port: conn.portNumber,
    database: conn.databaseName || "postgres",
    username: conn.usernameText || undefined,
    password: conn.passwordText || undefined,
    ssl: conn.sslEnabled ? "require" : false,
    max: 1, connect_timeout: 15, idle_timeout: 10,
  });

  try {
    const schemaFilter = conn.defaultSchema
      ? pg`n.nspname = ${conn.defaultSchema}`
      : pg`n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'`;

    // ── Harvest views + matviews (each independently toggleable per connection config) ──
    const relkinds: string[] = [
      ...(conn.lineageScanViews ? ["v"] : []),
      ...(conn.lineageScanMatviews ? ["m"] : []),
    ];
    const viewRows = relkinds.length === 0 ? [] : await pg<{ schema: string; name: string; def: string; kind: string }[]>`
      SELECT n.nspname AS schema, c.relname AS name, pg_get_viewdef(c.oid, true) AS def,
             CASE WHEN c.relkind = 'm' THEN 'MATVIEW' ELSE 'VIEW' END AS kind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = ANY(${relkinds}) AND ${schemaFilter}
    `;

    // ── Harvest procedures + functions (plpgsql/sql only, each independently toggleable) ──
    const prokinds: string[] = [
      ...(conn.lineageScanProcedures ? ["p"] : []),
      ...(conn.lineageScanFunctions ? ["f", "a", "w"] : []),
    ];
    const routineRows = prokinds.length === 0 ? [] : await pg<{ schema: string; name: string; def: string; kind: string }[]>`
      SELECT n.nspname AS schema, p.proname AS name, pg_get_functiondef(p.oid) AS def,
             CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS kind
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
      WHERE l.lanname IN ('plpgsql', 'sql') AND p.prokind = ANY(${prokinds}) AND ${schemaFilter}
    `;

    const sourceObjects: SourceObject[] = [
      ...viewRows.map((v) => ({ schemaName: v.schema, objectName: v.name, processType: v.kind as ProcessTypeCode, definitionText: v.def })),
      ...routineRows.map((r) => ({ schemaName: r.schema, objectName: r.name, processType: r.kind as ProcessTypeCode, definitionText: r.def })),
    ];

    // Column type lookup for the target connection's own catalog (used when we need to create missing attributes)
    const colTypeRows = await pg<{ schema: string; table: string; column: string; dataType: string }[]>`
      SELECT table_schema AS schema, table_name AS table, column_name AS column, data_type AS "dataType"
      FROM information_schema.columns
      WHERE ${conn.defaultSchema ? pg`table_schema = ${conn.defaultSchema}` : pg`table_schema NOT IN ('pg_catalog', 'information_schema')`}
    `;
    const colTypeMap = new Map(colTypeRows.map((c) => [`${c.schema}.${c.table}.${c.column}`, c.dataType]));
    const tableColumnsMap = new Map<string, string[]>();
    for (const c of colTypeRows) {
      const key = `${c.schema}.${c.table}`;
      const arr = tableColumnsMap.get(key) ?? [];
      arr.push(c.column);
      tableColumnsMap.set(key, arr);
    }

    for (const obj of sourceObjects) {
      processesScanned++;
      const definitionHash = createHash("sha256").update(obj.definitionText).digest("hex");
      const qualifiedName = `${obj.schemaName}.${obj.objectName}`;

      const [procRow] = await sql<{ id: number }[]>`
        INSERT INTO bayanat.lineage_processes (connection_id, process_type_code, schema_name, process_name, definition_text, definition_hash, last_scanned_timestamp)
        VALUES (${connectionId}, ${obj.processType}, ${obj.schemaName}, ${obj.objectName}, ${obj.definitionText}, ${definitionHash}, NOW())
        ON CONFLICT (connection_id, schema_name, process_name, process_type_code)
        DO UPDATE SET definition_text = EXCLUDED.definition_text, definition_hash = EXCLUDED.definition_hash, last_scanned_timestamp = NOW()
        RETURNING process_id AS id
      `;
      const processId = procRow.id;
      touchedProcessIds.push(processId);

      // Always replace this process's own SCANNED edges (definition may have changed); MANUAL edges untouched.
      const removed = await sql`
        DELETE FROM bayanat.data_lineage WHERE process_id = ${processId} AND provenance_code = 'SCANNED' RETURNING lineage_id
      `;
      edgesRemoved += removed.length;

      const isRoutine = obj.processType === "PROCEDURE" || obj.processType === "FUNCTION";
      const bodyText = isRoutine ? extractRoutineBody(obj.definitionText) : obj.definitionText;
      // Views/matviews come back from pg_get_viewdef() as a bare SELECT with no
      // CREATE VIEW wrapper, so the object itself is the implicit target.
      const viewTarget = isRoutine ? null : { schemaName: obj.schemaName, tableName: obj.objectName };

      let statementLineages;
      try {
        statementLineages = await extractLineageFromDefinitionAsync(qualifiedName, bodyText, warnings, viewTarget);
      } catch (e) {
        warnings.push({ object: qualifiedName, message: `Failed to parse: ${(e as Error).message}` });
        continue;
      }

      for (const stmtLineage of statementLineages) {
        const targetSchema = stmtLineage.targetSchema ?? obj.schemaName;
        const targetSchemaId = await ensureSchema(dataSource.id, targetSchema);
        const targetIsView = obj.processType === "VIEW" || obj.processType === "MATVIEW";
        const targetEntityId = await ensureEntity(targetSchemaId, stmtLineage.targetTable, targetIsView);

        const attributeEdges: { sourceAttrId: number; targetAttrId: number; mapping: ExtractedMapping }[] = [];

        // Find a source table by name anywhere in the connection's own catalog
        // (schema-qualified key "schema.table" -> its known columns).
        const findSourceTable = (tableName: string): { schemaName: string; columns: string[] } | null => {
          const entry = [...tableColumnsMap.entries()].find(([k]) => k.endsWith(`.${tableName}`));
          return entry ? { schemaName: entry[0].split(".")[0], columns: entry[1] } : null;
        };

        const resolveSourceAttr = async (tableName: string, columnName: string): Promise<number> => {
          const found = findSourceTable(tableName);
          const srcSchemaName = found?.schemaName ?? targetSchema;
          const srcSchemaId = await ensureSchema(dataSource.id, srcSchemaName);
          const srcEntityId = await ensureEntity(srcSchemaId, tableName, false);
          return ensureAttribute(srcEntityId, columnName, colTypeMap.get(`${srcSchemaName}.${tableName}.${columnName}`) ?? null);
        };

        for (const mapping of stmtLineage.mappings) {
          if (mapping.targetColumn === "*") {
            // SELECT * — expand using known source columns when the source table is known.
            const src = mapping.sources[0];
            const found = src?.table ? findSourceTable(src.table) : null;
            if (!src?.table || !found) {
              warnings.push({ object: qualifiedName, message: `SELECT * from unresolvable table on ${stmtLineage.targetTable} — skipped` });
              continue;
            }
            for (const colName of found.columns) {
              const targetAttrId = await ensureAttribute(targetEntityId, colName, colTypeMap.get(`${targetSchema}.${stmtLineage.targetTable}.${colName}`) ?? null);
              const sourceAttrId = await resolveSourceAttr(src.table, colName);
              attributeEdges.push({ sourceAttrId, targetAttrId, mapping: { ...mapping, targetColumn: colName } });
            }
            continue;
          }

          const targetAttrId = await ensureAttribute(targetEntityId, mapping.targetColumn, colTypeMap.get(`${targetSchema}.${stmtLineage.targetTable}.${mapping.targetColumn}`) ?? null);

          for (const src of mapping.sources) {
            if (!src.table) continue; // unresolved (ambiguous unqualified column) — already reflected in confidence=LOW
            const sourceAttrId = await resolveSourceAttr(src.table, src.column);
            attributeEdges.push({ sourceAttrId, targetAttrId, mapping });
          }
        }

        for (const edge of attributeEdges) {
          if (edge.sourceAttrId === edge.targetAttrId) continue; // no self-edges
          await sql`
            INSERT INTO bayanat.data_lineage
              (lineage_scope_code, source_asset_id, target_asset_id, asset_type_code,
               transformation_type_code, transformation_logic_text, process_id,
               provenance_code, confidence_code, connection_id)
            VALUES
              ('ATTRIBUTE_LEVEL', ${edge.sourceAttrId}, ${edge.targetAttrId}, 'DATA_ATTRIBUTES',
               ${edge.mapping.transformationType}, ${edge.mapping.logicText}, ${processId},
               'SCANNED', ${edge.mapping.confidence}, ${connectionId})
            ON CONFLICT (lineage_scope_code, source_asset_id, target_asset_id, COALESCE(process_id, -1))
            DO UPDATE SET transformation_type_code = EXCLUDED.transformation_type_code,
                          transformation_logic_text = EXCLUDED.transformation_logic_text,
                          confidence_code = EXCLUDED.confidence_code,
                          last_updated_timestamp = NOW()
          `;
          edgesCreated++;

          // Roll up to an ENTITY_LEVEL edge (scope requirement: every ATTRIBUTE_LEVEL
          // edge must have a corresponding ENTITY_LEVEL edge).
          const [srcAttr] = await sql<{ entityId: number }[]>`SELECT entity_id AS "entityId" FROM bayanat.data_attributes WHERE attribute_id = ${edge.sourceAttrId}`;
          const [tgtAttr] = await sql<{ entityId: number }[]>`SELECT entity_id AS "entityId" FROM bayanat.data_attributes WHERE attribute_id = ${edge.targetAttrId}`;
          if (srcAttr && tgtAttr && srcAttr.entityId !== tgtAttr.entityId) {
            await sql`
              INSERT INTO bayanat.data_lineage
                (lineage_scope_code, source_asset_id, target_asset_id, asset_type_code,
                 transformation_type_code, transformation_logic_text, process_id,
                 provenance_code, confidence_code, connection_id)
              VALUES
                ('ENTITY_LEVEL', ${srcAttr.entityId}, ${tgtAttr.entityId}, 'DATA_ENTITIES',
                 ${edge.mapping.transformationType}, ${`Rolled up from ${edge.mapping.targetColumn} — see column-level lineage`}, ${processId},
                 'SCANNED', ${edge.mapping.confidence}, ${connectionId})
              ON CONFLICT (lineage_scope_code, source_asset_id, target_asset_id, COALESCE(process_id, -1))
              DO NOTHING
            `;
          }
        }
      }
    }

    // Processes that used to exist under this connection but weren't found this
    // scan (dropped/renamed view or routine) — remove their SCANNED edges and
    // the stale process record itself (FR-1.8: "edges whose process disappeared
    // are deleted"). MANUAL edges have no process_id tie to a scanned process
    // the way SCANNED ones do, so they're unaffected.
    const staleProcesses = await sql<{ id: number }[]>`
      SELECT process_id AS id FROM bayanat.lineage_processes
      WHERE connection_id = ${connectionId}
        AND process_id != ALL(${touchedProcessIds.length > 0 ? touchedProcessIds : [-1]})
    `;
    for (const stale of staleProcesses) {
      const removedStale = await sql`
        DELETE FROM bayanat.data_lineage WHERE process_id = ${stale.id} AND provenance_code = 'SCANNED' RETURNING lineage_id
      `;
      edgesRemoved += removedStale.length;
      await sql`DELETE FROM bayanat.lineage_processes WHERE process_id = ${stale.id}`;
    }

    await sql`
      UPDATE bayanat.lineage_scan_runs SET
        status_code = 'COMPLETED', finished_at = NOW(),
        processes_scanned_count = ${processesScanned}, edges_created_count = ${edgesCreated},
        edges_removed_count = ${edgesRemoved}, warnings = ${JSON.stringify(warnings)}::jsonb
      WHERE scan_run_id = ${scanRunId}
    `;

    return { scanRunId };
  } catch (err) {
    await sql`
      UPDATE bayanat.lineage_scan_runs SET
        status_code = 'FAILED', finished_at = NOW(),
        processes_scanned_count = ${processesScanned}, edges_created_count = ${edgesCreated},
        edges_removed_count = ${edgesRemoved},
        warnings = ${JSON.stringify([...warnings, { object: "scan", message: (err as Error).message }])}::jsonb
      WHERE scan_run_id = ${scanRunId}
    `;
    throw err;
  } finally {
    await pg.end({ timeout: 5 });
  }
}
