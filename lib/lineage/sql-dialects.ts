// Brings SQL Server / MySQL / Oracle view definitions close enough to PostgreSQL
// syntax for libpg-query to parse them (lib/lineage/view-anatomy.ts). Only the
// constructs that differ in *syntax* are rewritten — bracket/backtick quoting,
// N'…' literals, table hints, TOP, CONVERT(), LIMIT a,b, MINUS, the CREATE VIEW
// wrapper. Anything that still doesn't parse (Oracle (+) joins, CONNECT BY, OUTER
// APPLY…) falls back to showing the SQL as-is.

export type SqlDialect = "POSTGRES" | "MSSQL" | "ORACLE" | "MYSQL";

/** Replace outside of string literals and comments only. */
function mapCode(sql: string, fn: (code: string) => string, stripNationalPrefix = false): string {
  let out = "", i = 0, code = "";
  const flush = () => { out += fn(code); code = ""; };
  while (i < sql.length) {
    const c = sql[i], n = sql[i + 1];
    if (c === "'") {
      flush();
      // SQL Server N'…' (national) literal → plain literal
      if (stripNationalPrefix && /(^|[^\w])N$/.test(out)) out = out.slice(0, -1);
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      out += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "-" && n === "-") { flush(); const j = sql.indexOf("\n", i); i = j < 0 ? sql.length : j; continue; }
    if (c === "/" && n === "*") { flush(); const j = sql.indexOf("*/", i + 2); i = j < 0 ? sql.length : j + 2; continue; }
    code += c; i++;
  }
  flush();
  return out;
}

// CONVERT(type, expr[, style]) → CAST(expr AS type), paren-aware.
function rewriteConvert(sql: string): string {
  const re = /\bCONVERT\s*\(/gi;
  let m: RegExpExecArray | null, out = "", last = 0;
  while ((m = re.exec(sql))) {
    let depth = 1, j = m.index + m[0].length;
    const args: string[] = [];
    let start = j;
    for (; j < sql.length && depth > 0; j++) {
      const ch = sql[j];
      if (ch === "(") depth++;
      else if (ch === ")") { depth--; if (depth === 0) args.push(sql.slice(start, j)); }
      else if (ch === "," && depth === 1) { args.push(sql.slice(start, j)); start = j + 1; }
    }
    if (depth !== 0 || args.length < 2) continue;
    out += sql.slice(last, m.index) + `CAST(${rewriteConvert(args[1].trim())} AS ${args[0].trim()})`;
    last = j;
    re.lastIndex = j;
  }
  return out + sql.slice(last);
}

export function toParsableSql(dialect: SqlDialect, text: string): string {
  let sql = text.replace(/^﻿/, "");
  // CREATE [OR REPLACE | OR ALTER] [FORCE] [MATERIALIZED] VIEW name [(cols)] [WITH …] AS <select>
  sql = sql.replace(/^[\s\S]*?\bCREATE\b[\s\S]*?\bVIEW\b[\s\S]*?\bAS\b\s*(?=\(|SELECT\b|WITH\b)/i, "");
  sql = sql.replace(/\bWITH\s+(CHECK\s+OPTION|READ\s+ONLY)\b[\s\S]*$/i, "").replace(/[;\s]*(\bGO\b)?[;\s]*$/i, "");
  if (dialect === "POSTGRES") return sql;

  const mapped = mapCode(sql, (code) => {
    let c = code;
    if (dialect === "MSSQL") {
      c = c.replace(/\[((?:[^\]]|\]\])+)\]/g, (_m, id: string) => `"${id.replace(/\]\]/g, "]").replace(/"/g, '""')}"`);
      c = c.replace(/\bWITH\s*\(\s*(?:NOLOCK|READUNCOMMITTED|READCOMMITTED|REPEATABLEREAD|SERIALIZABLE|HOLDLOCK|UPDLOCK|ROWLOCK|PAGLOCK|TABLOCK|TABLOCKX|NOEXPAND|INDEX\s*\([^)]*\)|\s|,)+\)/gi, "");
      c = c.replace(/\(\s*NOLOCK\s*\)/gi, "");
      c = c.replace(/\bTOP\s*(\(\s*\d+\s*\)|\d+)(\s+PERCENT)?(\s+WITH\s+TIES)?/gi, "");
      c = c.replace(/\bCROSS\s+APPLY\b/gi, "CROSS JOIN LATERAL");
    }
    if (dialect === "MYSQL") {
      c = c.replace(/`((?:[^`]|``)+)`/g, (_m, id: string) => `"${id.replace(/``/g, "`").replace(/"/g, '""')}"`);
      c = c.replace(/\bLIMIT\s+(\d+)\s*,\s*(\d+)/gi, "LIMIT $2 OFFSET $1");
    }
    if (dialect === "ORACLE") c = c.replace(/\bMINUS\b/gi, "EXCEPT");
    return c;
  }, dialect === "MSSQL");
  return dialect === "MSSQL" ? rewriteConvert(mapped) : mapped;
}

/** Engines whose unquoted identifiers are case-insensitive but stored upper/mixed case. */
export const caseInsensitive = (dialect: SqlDialect) => dialect !== "POSTGRES";
