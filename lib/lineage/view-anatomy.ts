// View anatomy: how a view is built — the tables it reads, how they are joined
// (type + condition), the filters, grouping, and where every output column comes
// from. Parsed from the view's stored definition (lineage_processes.definition_text,
// captured by the PostgreSQL lineage scan) with libpg-query; read-only.
import { parse as pgParse } from "libpg-query";
import { sql } from "../db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export type ColumnRefOut = { alias: string | null; column: string };
export type ViewSource = {
  alias: string; kind: "TABLE" | "SUBQUERY" | "CTE" | "FUNCTION";
  schema: string | null; name: string;
  entityId: number | null; schemaId: number | null; objectTypeCode: string | null;
  usedColumns: string[];
  subquery: ViewQuery | null;
};
export type ViewJoin = {
  type: "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS";
  implicit: boolean;          // comma-separated FROM list: matched in WHERE, not ON
  natural: boolean;
  leftAliases: string[]; rightAliases: string[];
  condition: string | null; using: string[];
  pairs: { left: ColumnRefOut; op: string; right: ColumnRefOut }[];
};
export type OutputColumn = {
  name: string; expression: string;
  kind: "DIRECT" | "RENAMED" | "CAST" | "CALCULATED" | "AGGREGATE" | "WINDOW" | "CONDITIONAL" | "CONSTANT";
  sources: ColumnRefOut[];
};
export type ViewSelect = {
  kind: "SELECT";
  distinct: boolean;
  ctes: { name: string; query: ViewQuery }[];
  sources: ViewSource[];
  joins: ViewJoin[];
  filters: string[];
  groupBy: string[];
  having: string[];
  orderBy: string[];
  limit: string | null;
  columns: OutputColumn[];
};
export type ViewSetOp = {
  kind: "SET_OP"; op: string;
  ctes: { name: string; query: ViewQuery }[];
  branches: ViewQuery[]; orderBy: string[]; limit: string | null;
};
export type ViewQuery = ViewSelect | ViewSetOp;

// ── Expression formatting (libpg-query has no deparser in this version) ─────────

const s = (n: N): string => n?.String?.sval ?? n?.sval ?? "";
const typeName = (t: N): string => {
  const names = (t?.names ?? []).map(s).filter((x: string) => x !== "pg_catalog");
  const mods = (t?.typmods ?? []).map(fmt);
  const base = names.join(".") || "?";
  const nice: Record<string, string> = { int4: "integer", int8: "bigint", int2: "smallint", float8: "double precision", float4: "real", bool: "boolean", timestamptz: "timestamp with time zone", varchar: "varchar", bpchar: "char" };
  return (nice[base] ?? base) + (mods.length ? `(${mods.join(", ")})` : "") + (t?.arrayBounds?.length ? "[]" : "");
};
const quoteIdent = (x: string) => (/^[a-z_][a-z0-9_$]*$/.test(x) ? x : `"${x.replace(/"/g, '""')}"`);

let inCondition = false;
/** Format a filter / join / grouping expression (comparison casts hidden). */
function fmtCond(n: N): string {
  const prev = inCondition;
  inCondition = true;
  try { return fmt(n); } finally { inCondition = prev; }
}

export function fmt(n: N): string {
  if (n == null) return "";
  if (Array.isArray(n)) return n.map(fmt).join(", ");
  if (n.ColumnRef) return n.ColumnRef.fields.map((f: N) => (f.A_Star ? "*" : quoteIdent(s(f)))).join(".");
  if (n.A_Const) {
    const c = n.A_Const;
    if (c.isnull) return "NULL";
    if (c.sval) return `'${(c.sval.sval ?? "").replace(/'/g, "''")}'`;
    if (c.ival) return String(c.ival.ival ?? 0);
    if (c.fval) return c.fval.fval;
    if (c.boolval) return c.boolval.boolval ? "true" : "false";
    if (c.bsval) return c.bsval.bsval;
    return "NULL";
  }
  if (n.TypeCast) {
    const arg = n.TypeCast.arg, target = typeName(n.TypeCast.typeName);
    // 'month'::text style constants read better without the cast
    if (arg?.A_Const?.sval && target === "text") return fmt(arg);
    // In conditions, the casts pg_get_viewdef adds for comparisons (status::text,
    // 0::numeric) are noise; output columns keep theirs (they change the type).
    if (inCondition && (arg?.ColumnRef || arg?.A_Const) && ["text", "varchar", "numeric", "integer", "bigint"].includes(target)) return fmt(arg);
    return `${fmt(arg)}::${target}`;
  }
  if (n.A_Expr) {
    const e = n.A_Expr, op = (e.name ?? []).map(s).join("");
    switch (e.kind) {
      case "AEXPR_IN": return `${fmt(e.lexpr)} ${op === "<>" ? "NOT IN" : "IN"} (${fmt(e.rexpr)})`;
      case "AEXPR_LIKE": return `${fmt(e.lexpr)} ${op === "!~~" ? "NOT LIKE" : "LIKE"} ${fmt(e.rexpr)}`;
      case "AEXPR_ILIKE": return `${fmt(e.lexpr)} ${op === "!~~*" ? "NOT ILIKE" : "ILIKE"} ${fmt(e.rexpr)}`;
      case "AEXPR_BETWEEN": case "AEXPR_NOT_BETWEEN": {
        const [a, b] = e.rexpr?.List?.items ?? e.rexpr ?? [];
        return `${fmt(e.lexpr)} ${e.kind === "AEXPR_NOT_BETWEEN" ? "NOT BETWEEN" : "BETWEEN"} ${fmt(a)} AND ${fmt(b)}`;
      }
      case "AEXPR_DISTINCT": return `${fmt(e.lexpr)} IS DISTINCT FROM ${fmt(e.rexpr)}`;
      case "AEXPR_NOT_DISTINCT": return `${fmt(e.lexpr)} IS NOT DISTINCT FROM ${fmt(e.rexpr)}`;
      case "AEXPR_NULLIF": return `NULLIF(${fmt(e.lexpr)}, ${fmt(e.rexpr)})`;
      case "AEXPR_OP_ANY": return `${fmt(e.lexpr)} ${op} ANY (${fmt(e.rexpr)})`;
      case "AEXPR_OP_ALL": return `${fmt(e.lexpr)} ${op} ALL (${fmt(e.rexpr)})`;
      default: return e.lexpr ? `${fmt(e.lexpr)} ${op} ${fmt(e.rexpr)}` : `${op}${fmt(e.rexpr)}`;
    }
  }
  if (n.List) return fmt(n.List.items);
  if (n.BoolExpr) {
    const b = n.BoolExpr, args = (b.args ?? []).map((a: N) => (a.BoolExpr && a.BoolExpr.boolop !== b.boolop ? `(${fmt(a)})` : fmt(a)));
    if (b.boolop === "NOT_EXPR") return `NOT ${args[0]}`;
    return args.join(b.boolop === "AND_EXPR" ? " AND " : " OR ");
  }
  if (n.FuncCall) {
    const f = n.FuncCall, name = (f.funcname ?? []).map(s).filter((x: string) => x !== "pg_catalog").join(".");
    const args = f.agg_star ? "*" : `${f.agg_distinct ? "DISTINCT " : ""}${fmt(f.args ?? [])}`;
    const order = f.agg_order?.length ? ` ORDER BY ${f.agg_order.map(fmtSort).join(", ")}` : "";
    const filter = f.agg_filter ? ` FILTER (WHERE ${fmt(f.agg_filter)})` : "";
    let over = "";
    if (f.over) {
      const w = f.over.WindowDef ?? f.over;
      const parts = [
        w.partitionClause?.length ? `PARTITION BY ${fmt(w.partitionClause)}` : "",
        w.orderClause?.length ? `ORDER BY ${w.orderClause.map(fmtSort).join(", ")}` : "",
      ].filter(Boolean);
      over = ` OVER (${w.name ? w.name : parts.join(" ")})`;
    }
    return `${name}(${args}${order})${filter}${over}`;
  }
  if (n.NullTest) return `${fmt(n.NullTest.arg)} ${n.NullTest.nulltesttype === "IS_NOT_NULL" ? "IS NOT NULL" : "IS NULL"}`;
  if (n.BooleanTest) return `${fmt(n.BooleanTest.arg)} ${String(n.BooleanTest.booltesttype ?? "").replace(/_/g, " ")}`;
  if (n.CaseExpr) {
    const c = n.CaseExpr;
    const whens = (c.args ?? []).map((w: N) => `WHEN ${fmt(w.CaseWhen.expr)} THEN ${fmt(w.CaseWhen.result)}`).join(" ");
    return `CASE ${c.arg ? fmt(c.arg) + " " : ""}${whens}${c.defresult ? ` ELSE ${fmt(c.defresult)}` : ""} END`;
  }
  if (n.CoalesceExpr) return `COALESCE(${fmt(n.CoalesceExpr.args)})`;
  if (n.MinMaxExpr) return `${n.MinMaxExpr.op === "IS_LEAST" ? "LEAST" : "GREATEST"}(${fmt(n.MinMaxExpr.args)})`;
  if (n.SQLValueFunction) return String(n.SQLValueFunction.op ?? "").replace(/^SVFOP_/, "");
  if (n.SubLink) {
    const l = n.SubLink, sub = briefSelect(l.subselect?.SelectStmt);
    if (l.subLinkType === "EXISTS_SUBLINK") return `EXISTS (${sub})`;
    if (l.subLinkType === "ANY_SUBLINK") return `${fmt(l.testexpr)} IN (${sub})`;
    if (l.subLinkType === "ALL_SUBLINK") return `${fmt(l.testexpr)} ALL (${sub})`;
    return `(${sub})`;
  }
  if (n.RowExpr) return `(${fmt(n.RowExpr.args)})`;
  if (n.A_ArrayExpr) return `ARRAY[${fmt(n.A_ArrayExpr.elements ?? [])}]`;
  if (n.A_Indirection) return `${fmt(n.A_Indirection.arg)}[…]`;
  if (n.ParamRef) return `$${n.ParamRef.number ?? ""}`;
  if (n.CollateClause) return `${fmt(n.CollateClause.arg)} COLLATE ${(n.CollateClause.collname ?? []).map(s).join(".")}`;
  if (n.ResTarget) return fmt(n.ResTarget.val);
  return "…";
}
// One-line summary of a sub-select: what it reads and its condition.
function briefSelect(q: N): string {
  if (!q) return "SELECT …";
  const tables: string[] = [];
  walk(q.fromClause ?? [], (x) => {
    if (x.RangeVar) { tables.push([x.RangeVar.schemaname, x.RangeVar.relname].filter(Boolean).join(".") + (x.RangeVar.alias ? ` ${x.RangeVar.alias.aliasname}` : "")); return false; }
  });
  return `SELECT … FROM ${tables.join(", ") || "…"}${q.whereClause ? ` WHERE ${fmt(q.whereClause)}` : ""}`;
}
function fmtSort(n: N): string {
  const b = n.SortBy ?? n;
  const dir = b.sortby_dir === "SORTBY_DESC" ? " DESC" : b.sortby_dir === "SORTBY_ASC" ? " ASC" : "";
  const nulls = b.sortby_nulls === "SORTBY_NULLS_FIRST" ? " NULLS FIRST" : b.sortby_nulls === "SORTBY_NULLS_LAST" ? " NULLS LAST" : "";
  return `${fmt(b.node)}${dir}${nulls}`;
}

// ── AST walking helpers ───────────────────────────────────────────────────────

const AGGREGATES = new Set(["sum", "count", "avg", "min", "max", "array_agg", "string_agg", "bool_and", "bool_or", "every", "stddev", "stddev_pop", "stddev_samp", "variance", "var_pop", "var_samp", "json_agg", "jsonb_agg", "json_object_agg", "jsonb_object_agg", "percentile_cont", "percentile_disc", "mode"]);

function walk(n: N, visit: (n: N) => boolean | void): void {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const x of n) walk(x, visit); return; }
  if (visit(n) === false) return;
  for (const k of Object.keys(n)) walk(n[k], visit);
}
/** ColumnRefs in an expression, not descending into sub-selects (their own scope). */
function columnRefs(n: N): string[][] {
  const out: string[][] = [];
  walk(n, (x) => {
    if (x.SubLink || x.SelectStmt) return false;
    if (x.ColumnRef) { out.push(x.ColumnRef.fields.map((f: N) => (f.A_Star ? "*" : s(f)))); return false; }
  });
  return out;
}
function hasAggregate(n: N): boolean {
  let found = false;
  walk(n, (x) => {
    if (x.SubLink) return false;
    if (x.FuncCall && !x.FuncCall.over && AGGREGATES.has(s(x.FuncCall.funcname.at(-1)).toLowerCase())) found = true;
  });
  return found;
}
function hasWindow(n: N): boolean {
  let found = false;
  walk(n, (x) => { if (x.SubLink) return false; if (x.FuncCall?.over) found = true; });
  return found;
}
function splitAnd(n: N): N[] {
  if (!n) return [];
  if (n.BoolExpr?.boolop === "AND_EXPR") return n.BoolExpr.args.flatMap(splitAnd);
  return [n];
}

type CatalogTable = { entityId: number; schemaId: number; schema: string; name: string; objectTypeCode: string; columns: string[] };
type Catalog = { find: (schema: string | null, name: string) => CatalogTable | null };

// ── Building the anatomy ──────────────────────────────────────────────────────

function buildQuery(stmt: N, catalog: Catalog, outerCtes: Set<string>): ViewQuery {
  const ctes: { name: string; query: ViewQuery }[] = [];
  const cteNames = new Set(outerCtes);
  for (const c of stmt.withClause?.ctes ?? []) {
    const cte = c.CommonTableExpr;
    const q = cte?.ctequery?.SelectStmt;
    if (!q) continue;
    ctes.push({ name: cte.ctename, query: buildQuery(q, catalog, cteNames) });
    cteNames.add(cte.ctename);
  }

  if (stmt.op && stmt.op !== "SETOP_NONE") {
    const branches: ViewQuery[] = [];
    const op = `${String(stmt.op).replace("SETOP_", "")}${stmt.all ? " ALL" : ""}`;
    const collect = (x: N) => {
      // a chain of the same operator reads as one list of parts
      if (x.op === stmt.op && !!x.all === !!stmt.all && !x.withClause && !x.sortClause?.length) { collect(x.larg); collect(x.rarg); }
      else branches.push(buildQuery(x, catalog, cteNames));
    };
    collect(stmt.larg); collect(stmt.rarg);
    return { kind: "SET_OP", op, ctes, branches, orderBy: (stmt.sortClause ?? []).map(fmtSort), limit: stmt.limitCount ? fmt(stmt.limitCount) : null };
  }

  const sources: ViewSource[] = [];
  const joins: ViewJoin[] = [];

  const addSource = (n: N): string[] => {
    if (n.RangeVar) {
      const r = n.RangeVar;
      const alias = r.alias?.aliasname ?? r.relname;
      const isCte = !r.schemaname && cteNames.has(r.relname);
      const cat = isCte ? null : catalog.find(r.schemaname ?? null, r.relname);
      sources.push({
        alias, kind: isCte ? "CTE" : "TABLE", schema: r.schemaname ?? cat?.schema ?? null, name: r.relname,
        entityId: cat?.entityId ?? null, schemaId: cat?.schemaId ?? null, objectTypeCode: cat?.objectTypeCode ?? null,
        usedColumns: [], subquery: null,
      });
      return [alias];
    }
    if (n.RangeSubselect) {
      const alias = n.RangeSubselect.alias?.aliasname ?? `subquery_${sources.length + 1}`;
      sources.push({
        alias, kind: "SUBQUERY", schema: null, name: alias, entityId: null, schemaId: null, objectTypeCode: null, usedColumns: [],
        subquery: n.RangeSubselect.subquery?.SelectStmt ? buildQuery(n.RangeSubselect.subquery.SelectStmt, catalog, cteNames) : null,
      });
      return [alias];
    }
    if (n.RangeFunction) {
      const fn = n.RangeFunction.functions?.[0]?.List?.items?.[0];
      const alias = n.RangeFunction.alias?.aliasname ?? (fn?.FuncCall ? s(fn.FuncCall.funcname.at(-1)) : `function_${sources.length + 1}`);
      sources.push({ alias, kind: "FUNCTION", schema: null, name: fn ? fmt(fn) : alias, entityId: null, schemaId: null, objectTypeCode: null, usedColumns: [], subquery: null });
      return [alias];
    }
    if (n.JoinExpr) {
      const j = n.JoinExpr;
      const left = addSource(j.larg), right = addSource(j.rarg);
      const type = ({ JOIN_INNER: "INNER", JOIN_LEFT: "LEFT", JOIN_RIGHT: "RIGHT", JOIN_FULL: "FULL" } as Record<string, ViewJoin["type"]>)[j.jointype] ?? "INNER";
      const pairs: ViewJoin["pairs"] = [];
      for (const p of splitAnd(j.quals)) {
        const e = p?.A_Expr;
        if (e?.kind === "AEXPR_OP" && e.lexpr?.ColumnRef && e.rexpr?.ColumnRef) {
          const l = columnRefs(e.lexpr)[0], r = columnRefs(e.rexpr)[0];
          pairs.push({ left: { alias: l.length > 1 ? l.at(-2)! : null, column: l.at(-1)! }, op: (e.name ?? []).map(s).join(""), right: { alias: r.length > 1 ? r.at(-2)! : null, column: r.at(-1)! } });
        }
      }
      joins.push({
        type: !j.quals && !(j.usingClause?.length) && !j.isNatural && type === "INNER" ? "CROSS" : type,
        implicit: false, natural: !!j.isNatural, leftAliases: left, rightAliases: right,
        condition: j.quals ? fmtCond(j.quals) : null, using: (j.usingClause ?? []).map(s), pairs,
      });
      return [...left, ...right];
    }
    return [];
  };

  const from: N[] = stmt.fromClause ?? [];
  let seen: string[] = [];
  from.forEach((item, i) => {
    const aliases = addSource(item);
    if (i > 0) joins.push({ type: "CROSS", implicit: true, natural: false, leftAliases: seen, rightAliases: aliases, condition: null, using: [], pairs: [] });
    seen = [...seen, ...aliases];
  });

  // Which source does a column reference belong to?
  const byAlias = new Map(sources.map((x) => [x.alias, x]));
  const knownColumns = (src: ViewSource): string[] | null => {
    if (src.kind === "TABLE") return catalog.find(src.schema, src.name)?.columns ?? null;
    const q = src.kind === "SUBQUERY" ? src.subquery : src.kind === "CTE" ? findCte(src.name) : null;
    return q ? outputNames(q) : null;
  };
  const findCte = (name: string): ViewQuery | null => ctes.find((c) => c.name === name)?.query ?? null;
  const resolve = (parts: string[]): ColumnRefOut => {
    const column = parts.at(-1)!;
    if (parts.length > 1) {
      const qual = parts.at(-2)!;
      if (byAlias.has(qual)) return { alias: qual, column };
      const m = sources.find((x) => x.name === qual);
      return { alias: m?.alias ?? qual, column };
    }
    if (sources.length === 1) return { alias: sources[0].alias, column };
    const owners = sources.filter((x) => knownColumns(x)?.includes(column));
    return { alias: owners.length === 1 ? owners[0].alias : null, column };
  };
  const use = (n: N) => {
    for (const parts of columnRefs(n)) {
      const r = resolve(parts);
      const src = r.alias ? byAlias.get(r.alias) : null;
      if (src && r.column !== "*" && !src.usedColumns.includes(r.column)) src.usedColumns.push(r.column);
    }
  };
  for (const j of joins) j.pairs = j.pairs.map((p) => ({ ...p, left: resolveRef(p.left), right: resolveRef(p.right) }));
  function resolveRef(r: ColumnRefOut): ColumnRefOut { return r.alias ? r : resolve([r.column]); }

  // Output columns
  const columns: OutputColumn[] = [];
  for (const t of stmt.targetList ?? []) {
    const rt = t.ResTarget, val = rt.val;
    use(val);
    const refs = columnRefs(val);
    // SELECT * / t.* — list the columns when the source is known
    if (val?.ColumnRef && refs[0]?.at(-1) === "*") {
      const qual = refs[0].length > 1 ? refs[0].at(-2)! : null;
      const targets = qual ? sources.filter((x) => x.alias === qual) : sources;
      for (const src of targets) {
        const cols = knownColumns(src);
        if (!cols) { columns.push({ name: `${src.alias}.*`, expression: `${src.alias}.*`, kind: "DIRECT", sources: [{ alias: src.alias, column: "*" }] }); continue; }
        for (const c of cols) {
          if (!src.usedColumns.includes(c)) src.usedColumns.push(c);
          columns.push({ name: c, expression: `${src.alias}.${c}`, kind: "DIRECT", sources: [{ alias: src.alias, column: c }] });
        }
      }
      continue;
    }
    const sourcesOut = refs.map(resolve);
    const bareRef = val?.ColumnRef ? refs[0] : null;
    const name = rt.name ?? (bareRef ? bareRef.at(-1)! : val?.FuncCall ? s(val.FuncCall.funcname.at(-1)) : "?column?");
    let kind: OutputColumn["kind"];
    if (bareRef) kind = bareRef.at(-1) === name ? "DIRECT" : "RENAMED";
    else if (val?.TypeCast && val.TypeCast.arg?.ColumnRef) kind = "CAST";
    else if (hasWindow(val)) kind = "WINDOW";
    else if (hasAggregate(val)) kind = "AGGREGATE";
    else if (val?.CaseExpr || val?.CoalesceExpr) kind = "CONDITIONAL";
    else if (refs.length === 0) kind = "CONSTANT";
    else kind = "CALCULATED";
    columns.push({ name, expression: fmt(val), kind, sources: dedupe(sourcesOut) });
  }

  const filters = splitAnd(stmt.whereClause).map((p) => { use(p); return fmtCond(p); });
  for (const j of joins) {
    if (j.condition) use(findQuals(from, j));
    // USING (col): the column is matched on both sides
    for (const col of j.using) {
      for (const alias of [...j.leftAliases, ...j.rightAliases]) {
        const src = byAlias.get(alias);
        if (src && (j.rightAliases.includes(alias) || knownColumns(src)?.includes(col)) && !src.usedColumns.includes(col)) src.usedColumns.push(col);
      }
    }
  }
  const groupBy = (stmt.groupClause ?? []).map((g: N) => { use(g); return fmtCond(g); });
  const having = splitAnd(stmt.havingClause).map((p) => { use(p); return fmtCond(p); });
  const orderBy = (stmt.sortClause ?? []).map((o: N) => { use(o); return fmtSort(o); });

  return {
    kind: "SELECT", distinct: !!stmt.distinctClause, ctes, sources, joins,
    filters, groupBy, having, orderBy, limit: stmt.limitCount ? fmt(stmt.limitCount) : null, columns,
  };
}

// The JoinExpr whose quals produced a given join (to count its columns as used).
function findQuals(from: N[], j: ViewJoin): N {
  let found: N = null;
  walk(from, (x) => {
    if (x.SelectStmt) return false;
    if (x.JoinExpr?.quals && fmtCond(x.JoinExpr.quals) === j.condition) { found = x.JoinExpr.quals; return false; }
  });
  return found;
}
function dedupe(refs: ColumnRefOut[]): ColumnRefOut[] {
  const seen = new Set<string>();
  return refs.filter((r) => { const k = `${r.alias}|${r.column}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
export function outputNames(q: ViewQuery): string[] {
  return q.kind === "SELECT" ? q.columns.map((c) => c.name) : q.branches[0] ? outputNames(q.branches[0]) : [];
}

/** Parse a view definition (a bare SELECT from pg_get_viewdef, or a CREATE VIEW). */
export async function parseViewDefinition(definition: string, catalog: Catalog): Promise<ViewQuery> {
  const parsed = await pgParse(definition);
  const raw = parsed.stmts?.[0]?.stmt;
  const select = raw?.SelectStmt ?? raw?.ViewStmt?.query?.SelectStmt ?? raw?.CreateTableAsStmt?.query?.SelectStmt;
  if (!select) throw new Error("Not a SELECT-based view definition");
  return buildQuery(select, catalog, new Set());
}

/** Every table/view referenced anywhere in the definition (for catalog lookup). */
export async function referencedRelations(definition: string): Promise<{ schema: string | null; name: string }[]> {
  const parsed = await pgParse(definition);
  const out = new Map<string, { schema: string | null; name: string }>();
  walk(parsed, (x) => { if (x.RangeVar) out.set(`${x.RangeVar.schemaname ?? ""}.${x.RangeVar.relname}`, { schema: x.RangeVar.schemaname ?? null, name: x.RangeVar.relname }); });
  return [...out.values()];
}

// ── Entry point for the API ───────────────────────────────────────────────────

export type ViewAnatomyResult = {
  view: { entityId: number; name: string; schemaName: string | null; sourceName: string | null; objectTypeCode: string };
  definition: string | null; scannedAt: string | null;
  anatomy: ViewQuery | null;
  problem: "NO_DEFINITION" | "PARSE_FAILED" | null;
};

export async function getViewAnatomy(entityId: number): Promise<ViewAnatomyResult | null> {
  const [v] = await sql<{ entityId: number; name: string; schemaName: string | null; sourceName: string | null; objectTypeCode: string; dataSourceId: number; connectionId: number | null }[]>`
    SELECT e.entity_id AS "entityId", e.entity_name_text AS name, s.schema_name_text AS "schemaName", d.source_name_text AS "sourceName",
           e.object_type_code AS "objectTypeCode", d.data_source_id AS "dataSourceId", d.connection_id AS "connectionId"
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources d ON d.data_source_id = s.data_source_id
    WHERE e.entity_id = ${entityId}
  `;
  if (!v) return null;
  const view = { entityId: Number(v.entityId), name: v.name, schemaName: v.schemaName, sourceName: v.sourceName, objectTypeCode: v.objectTypeCode };

  // The view's own definition, as captured by the lineage scan of its connection.
  const [proc] = await sql<{ definition: string; scannedAt: string | null }[]>`
    SELECT definition_text AS definition, last_scanned_timestamp::text AS "scannedAt"
    FROM bayanat.lineage_processes
    WHERE process_type_code IN ('VIEW', 'MATVIEW') AND schema_name = ${v.schemaName} AND process_name = ${v.name}
    ORDER BY (connection_id IS NOT DISTINCT FROM ${v.connectionId}) DESC, last_scanned_timestamp DESC NULLS LAST
    LIMIT 1
  `;
  if (!proc?.definition?.trim()) return { view, definition: null, scannedAt: null, anatomy: null, problem: "NO_DEFINITION" };

  try {
    const rels = await referencedRelations(proc.definition);
    const names = [...new Set(rels.map((r) => r.name))];
    const rows = names.length === 0 ? [] : await sql<{ entityId: number; schemaId: number; schema: string; name: string; objectTypeCode: string; columns: string[] | null }[]>`
      SELECT e.entity_id AS "entityId", s.schema_id AS "schemaId", s.schema_name_text AS schema, e.entity_name_text AS name,
             e.object_type_code AS "objectTypeCode",
             (SELECT array_agg(a.physical_name_text ORDER BY a.attribute_id) FROM bayanat.data_attributes a WHERE a.entity_id = e.entity_id) AS columns
      FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE s.data_source_id = ${v.dataSourceId} AND e.entity_name_text = ANY(${names})
    `;
    const tables: CatalogTable[] = rows.map((r) => ({ ...r, entityId: Number(r.entityId), schemaId: Number(r.schemaId), columns: r.columns ?? [] }));
    const catalog: Catalog = {
      find: (schema, name) => {
        const same = tables.filter((t) => t.name === name);
        if (schema) return same.find((t) => t.schema === schema) ?? null;
        return same.find((t) => t.schema === v.schemaName) ?? same.find((t) => t.schema === "public") ?? (same.length === 1 ? same[0] : null);
      },
    };
    const anatomy = await parseViewDefinition(proc.definition, catalog);
    return { view, definition: proc.definition, scannedAt: proc.scannedAt, anatomy, problem: null };
  } catch {
    return { view, definition: proc.definition, scannedAt: proc.scannedAt, anatomy: null, problem: "PARSE_FAILED" };
  }
}
