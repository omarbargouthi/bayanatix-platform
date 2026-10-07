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
