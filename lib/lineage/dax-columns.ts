// Targeted reading of a DAX table expression — not a DAX parser. It answers one
// question for lineage: which model columns does each named column of a calculated
// table come from? A calculated table's columns are either passed through from another
// table (the model records that itself) or added by name:
//     ADDCOLUMNS ( <table>, "Name", <expression>, ... )
//     SELECTCOLUMNS / SUMMARIZE / SUMMARIZECOLUMNS / GROUPBY / ROW ( ..., "Name", <expression>, ... )
// For the second kind this finds the expression behind the name and the columns it reads.

export type DaxColumnRef = { table: string; column: string };

/** Index just past the token starting at i when it is a string, a 'quoted table' or a [bracketed name]; else -1. */
function skipQuoted(text: string, i: number): number {
  const ch = text[i];
  if (ch === '"' || ch === "'") {
    let j = i + 1;
    while (j < text.length) {
      if (text[j] === ch) { if (text[j + 1] === ch) { j += 2; continue; } return j + 1; }
      j++;
    }
    return text.length;
  }
  if (ch === "[") { const j = text.indexOf("]", i); return j < 0 ? text.length : j + 1; }
  return -1;
}

function stripComments(dax: string): string {
  let out = "";
  for (let i = 0; i < dax.length; ) {
    const q = skipQuoted(dax, i);
    if (q > 0) { out += dax.slice(i, q); i = q; continue; }
    if ((dax[i] === "/" && dax[i + 1] === "/") || (dax[i] === "-" && dax[i + 1] === "-")) { while (i < dax.length && dax[i] !== "\n") i++; continue; }
    if (dax[i] === "/" && dax[i + 1] === "*") { const j = dax.indexOf("*/", i + 2); i = j < 0 ? dax.length : j + 2; continue; }
    out += dax[i++];
  }
  return out;
}

/** The arguments of the call whose "(" is at `open`, and the index of its ")". */
function readArgs(text: string, open: number): { args: string[]; close: number } {
  const args: string[] = [];
  let depth = 0, start = open + 1, i = open + 1;
  while (i < text.length) {
    const q = skipQuoted(text, i);
    if (q > 0) { i = q; continue; }
    const ch = text[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") {
      if (depth === 0) { args.push(text.slice(start, i)); return { args, close: i }; }
      depth--;
    } else if (ch === "," && depth === 0) { args.push(text.slice(start, i)); start = i + 1; }
    i++;
  }
  args.push(text.slice(start));
  return { args, close: text.length };
}

const NAMING_FUNCTIONS = new Set(["ADDCOLUMNS", "SELECTCOLUMNS", "SUMMARIZE", "SUMMARIZECOLUMNS", "GROUPBY", "ROW", "ADDMISSINGITEMS"]);

/** Every "Name", <expression> pair of the table expression, keyed by lower-cased name.
 *  When a name is used at several nesting levels the outermost one wins — that is the
 *  one that reaches the table's result. */
export function daxNamedExpressions(dax: string): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (text: string) => {
    const inner: string[] = [];
    for (let i = 0; i < text.length; ) {
      const q = skipQuoted(text, i);
      if (q > 0) { i = q; continue; }
      const m = /^[A-Za-z_][\w.]*/.exec(text.slice(i));
      if (!m) { i++; continue; }
      let j = i + m[0].length;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] !== "(") { i += m[0].length; continue; }
      const { args, close } = readArgs(text, j);
      if (NAMING_FUNCTIONS.has(m[0].toUpperCase())) {
        for (let a = 0; a < args.length - 1; a++) {
          const lit = /^\s*"((?:[^"]|"")*)"\s*$/.exec(args[a]);
          if (!lit) continue;
          const name = lit[1].replace(/""/g, '"').toLowerCase();
          if (!found.has(name)) found.set(name, args[a + 1].trim());
          a++;
        }
      }
      inner.push(...args);
      i = close + 1;
    }
    for (const part of inner) walk(part);
  };
  walk(stripComments(dax));
  return found;
}

/** The model columns an expression reads: 'Table'[Column] / Table[Column]. Names it
 *  refers to without a table ([Other Name]) are followed through `named` when they are
 *  themselves named expressions of the same table expression. */
export function daxColumnRefs(expr: string, named: Map<string, string> = new Map(), seen: Set<string> = new Set()): DaxColumnRef[] {
  const refs = new Map<string, DaxColumnRef>();
  const text = stripComments(expr);
  for (let i = 0; i < text.length; ) {
    if (text[i] === '"') { i = skipQuoted(text, i); continue; }
    const m = /^(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))\s*\[([^\]]+)\]/.exec(text.slice(i));
    if (m) {
      const table = (m[1] ?? m[2]).replace(/''/g, "'");
      refs.set(`${table}\u0000${m[3]}`.toLowerCase(), { table, column: m[3] });
      i += m[0].length; continue;
    }
    if (text[i] === "[") {
      const end = skipQuoted(text, i);
      const name = text.slice(i + 1, end - 1).toLowerCase();
      const other = named.get(name);
      if (other && !seen.has(name)) {
        seen.add(name);
        for (const r of daxColumnRefs(other, named, seen)) refs.set(`${r.table}\u0000${r.column}`.toLowerCase(), r);
      }
      i = end; continue;
    }
    const word = /^[A-Za-z_][\w.]*/.exec(text.slice(i));
    i += word ? word[0].length : 1;
  }
  return [...refs.values()];
}

// ── Value columns vs filter columns ──────────────────────────────────────────
// A column an expression reads either supplies the value (it is counted, summed,
// returned…) or only decides which rows take part: it sits in the condition of
// FILTER, in the filter arguments of CALCULATE / CALCULATETABLE, or in the test of IF.
// A variable takes the role of the place it is used in, so
//     VAR CurrentName = T[name]  …  FILTER ( T, T[name] = CurrentName )
// makes T[name] a filter column. A column that does both counts as a value column.

// names:  [Name] references with no table that are not a named column of the expression
//         itself — in a measure these are other measures (or a column of its own table).
// tables: tables referred to as a whole ( COUNTROWS ( 'Table' ) ), lower-cased.
// Both are split by role the same way as columns.
export type DaxRoles = {
  value: DaxColumnRef[]; filter: DaxColumnRef[];
  names: { value: string[]; filter: string[] };
  tables: { value: string[]; filter: string[] };
};

/** For each function, the index of the first argument that is a row condition. */
const CONDITION_FROM: Record<string, number> = {
  FILTER: 1, CALCULATE: 1, CALCULATETABLE: 1, IF: 0, COUNTAX: -1, KEEPFILTERS: 0, REMOVEFILTERS: 0, ALL: -1, ALLEXCEPT: -1, ALLSELECTED: -1,
};
const CONDITION_ONLY_FIRST = new Set(["IF"]);

/** Splits `VAR a = … VAR b = … RETURN body` written at the top level of `text`. */
function splitVars(text: string): { vars: [string, string][]; body: string } | null {
  const marks: { kind: "VAR" | "RETURN"; at: number; end: number }[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; ) {
    const q = skipQuoted(text, i);
    if (q > 0) { i = q; continue; }
    const ch = text[i];
    if (ch === "(" || ch === "{") { depth++; i++; continue; }
    if (ch === ")" || ch === "}") { depth--; i++; continue; }
    const w = /^[A-Za-z_][\w.]*/.exec(text.slice(i));
    if (!w) { i++; continue; }
    const up = w[0].toUpperCase();
    if (depth === 0 && (up === "VAR" || up === "RETURN")) marks.push({ kind: up, at: i, end: i + w[0].length });
    i += w[0].length;
  }
  const ret = marks.findIndex((m) => m.kind === "RETURN");
  if (ret <= 0 || marks[0].kind !== "VAR") return null;
  const vars: [string, string][] = [];
  for (let k = 0; k < ret; k++) {
    const def = /^\s*([A-Za-z_][\w.]*)\s*=([\s\S]*)$/.exec(text.slice(marks[k].end, marks[k + 1].at));
    if (def) vars.push([def[1].toLowerCase(), def[2]]);
  }
  return { vars, body: text.slice(marks[ret].end) };
}

/**
 * The model columns `expr` reads, split by role. `named` are the table expression's
 * "Name", <expression> columns, followed when referred to as [Name].
 * `skipNamed`: leave the named expressions themselves out (used to find the conditions
 * that apply to the table as a whole, i.e. to every column of it).
 */
export function daxColumnRoles(expr: string, named: Map<string, string> = new Map(), opts: { skipNamed?: boolean; tableNames?: string[] } = {}): DaxRoles {
  // tableNames: the model's tables, so an unquoted table name ( COUNTROWS ( Sales ) ) is recognised.
  const knownTables = new Set((opts.tableNames ?? []).map((t) => t.toLowerCase()));
  const names = { value: new Set<string>(), filter: new Set<string>() };
  const tables = { value: new Set<string>(), filter: new Set<string>() };
  const value = new Map<string, DaxColumnRef>(), filter = new Map<string, DaxColumnRef>();
  const keyOf = (r: DaxColumnRef) => `${r.table}\u0000${r.column}`.toLowerCase();
  const add = (r: DaxColumnRef, inFilter: boolean) => (inFilter ? filter : value).set(keyOf(r), r);

  const walk = (raw: string, inFilter: boolean, scope: Map<string, string>, guard: Set<string>) => {
    let text = raw;
    const split = splitVars(text);
    if (split) {
      scope = new Map(scope);
      for (const [name, def] of split.vars) scope.set(name, def);
      text = split.body;
    }
    for (let i = 0; i < text.length; ) {
      if (text[i] === '"') { i = skipQuoted(text, i); continue; }
      const ref = /^(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))\s*\[([^\]]+)\]/.exec(text.slice(i));
      if (ref) { add({ table: (ref[1] ?? ref[2]).replace(/''/g, "'"), column: ref[3] }, inFilter); i += ref[0].length; continue; }
      if (text[i] === "'") {
        const end = skipQuoted(text, i);
        (inFilter ? tables.filter : tables.value).add(text.slice(i + 1, end - 1).replace(/''/g, "'").toLowerCase());
        i = end; continue;
      }
      if (text[i] === "[") {
        const end = skipQuoted(text, i);
        const name = text.slice(i + 1, end - 1).toLowerCase();
        const other = named.get(name);
        if (other) { if (!guard.has(`[${name}`)) walk(other, inFilter, scope, new Set(guard).add(`[${name}`)); }
        else (inFilter ? names.filter : names.value).add(name);
        i = end; continue;
      }
      const word = /^[A-Za-z_][\w.]*/.exec(text.slice(i));
      if (!word) { i++; continue; }
      let j = i + word[0].length;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "(") {
        const fn = word[0].toUpperCase();
        const { args, close } = readArgs(text, j);
        const from = CONDITION_FROM[fn];
        const naming = NAMING_FUNCTIONS.has(fn);
        for (let a = 0; a < args.length; a++) {
          if (naming && opts.skipNamed && a > 0 && /^\s*"(?:[^"]|"")*"\s*$/.test(args[a - 1])) continue;
          const condition = from !== undefined && from >= 0 && (CONDITION_ONLY_FIRST.has(fn) ? a === from : a >= from);
          walk(args[a], inFilter || condition, scope, guard);
        }
        i = close + 1; continue;
      }
      const v = scope.get(word[0].toLowerCase());
      if (v !== undefined) { if (!guard.has(word[0].toLowerCase())) walk(v, inFilter, scope, new Set(guard).add(word[0].toLowerCase())); }
      else if (knownTables.has(word[0].toLowerCase())) (inFilter ? tables.filter : tables.value).add(word[0].toLowerCase());
      i += word[0].length;
    }
  };
  walk(stripComments(expr), false, new Map(), new Set());
  for (const k of value.keys()) filter.delete(k);
  for (const k of names.value) names.filter.delete(k);
  for (const k of tables.value) tables.filter.delete(k);
  return {
    value: [...value.values()], filter: [...filter.values()],
    names: { value: [...names.value], filter: [...names.filter] },
    tables: { value: [...tables.value], filter: [...tables.filter] },
  };
}
