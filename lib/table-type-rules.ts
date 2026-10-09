// Table type suggestion: the rules and their configuration (Configuration > Table Type
// Rules, db/168).
//
// A crawl suggests one of five table types from what it knows right after reading the
// structure: the table's name, its column names and its row count. Each type collects
// points from the signals below and the type with the most points is suggested; the
// confidence is how far it is ahead of the runner-up. It is a transparent rule scorer
// on purpose — a steward has to be able to look at a suggestion and judge it — and it
// is only ever a suggestion: a type a steward confirmed is never overwritten.
//
// The keywords, the column-name patterns, the system prefixes, the points per signal,
// the size limits and the confidence gaps are settings. This file has no database access so the configuration screen can import
// the defaults; reading and saving the settings is in lib/queries/table-type-rules.ts.

export type CategoryCode = "MASTER" | "TRANSACTIONAL" | "REFERENCE" | "SETUP" | "SYSTEM";
export type ConfidenceCode = "HIGH" | "MEDIUM" | "LOW";

// Checked in this order, which also breaks ties: a more specific type wins over a
// broader one when both have the same points.
export const CATEGORY_PRIORITY: CategoryCode[] = ["SYSTEM", "SETUP", "REFERENCE", "TRANSACTIONAL", "MASTER"];

export type TableTypeWeights = {
  systemPrefix: number;       // schema / table named like a system object
  nameKeyword: number;        // table name contains one of the type's keywords
  timestampColumn: number;    // at least one date/time column          -> Transactional
  manyKeyColumns: number;     // two or more _id / _fk columns          -> Transactional
  oneKeyColumn: number;       // exactly one _id / _fk column           -> Transactional
  largeTable: number;         // more rows than the "large" limit       -> Transactional
  smallWithCodeDesc: number;  // small table with a code + name pair    -> Reference
  smallTable: number;         // small table without that pair          -> Reference
  wideEntity: number;         // many columns, no code pair, few keys   -> Master
  masterDefault: number;      // always, so Master wins when nothing stands out
};
export type TableTypeLimits = {
  largeRows: number;          // "large" = more rows than this
  smallMaxColumns: number;    // "small" = at most this many columns ...
  smallMaxRows: number;       // ... and fewer rows than this
  wideMinColumns: number;     // "wide" = at least this many columns
};
// How a column is recognised from its name. Plain text, not regular expressions, so an
// administrator can maintain the lists; matching ignores case.
export type TableTypeColumnPatterns = {
  timestampSuffixes: string[];  // date/time column: the name ends with one of these ...
  timestampPrefixes: string[];  // ... or starts with one of these
  keySuffixes: string[];        // key column (points at another table): ends with one of these
  codeNames: string[];          // code column: the name is one of these, or ends with "_" + one of these
  nameSuffixes: string[];       // name / description column: ends with one of these
};
export const COLUMN_PATTERN_KEYS: (keyof TableTypeColumnPatterns)[] = ["timestampSuffixes", "timestampPrefixes", "keySuffixes", "codeNames", "nameSuffixes"];
// A schema or table whose name starts with one of these is a system object.
export type TableTypeSystemPrefixes = { schema: string[]; table: string[] };

export type TableTypeConfig = {
  keywords: Record<CategoryCode, string[]>;
  columnPatterns: TableTypeColumnPatterns;
  systemPrefixes: TableTypeSystemPrefixes;
  weights: TableTypeWeights;
  limits: TableTypeLimits;
  confidence: { highGap: number; mediumGap: number };
};

export const DEFAULT_TABLE_TYPE_CONFIG: TableTypeConfig = {
  keywords: {
    SYSTEM:        ["sys", "audit", "session", "queue", "cache", "migration", "job_log", "error_log", "index", "metadata"],
    SETUP:         ["config", "setting", "param", "role", "permission", "workflow_rule", "rule", "tax_rate", "preference", "policy", "feature_flag"],
    REFERENCE:     ["type", "status", "category", "code", "lookup", "reference", "currency", "unit", "country", "region", "language", "gender", "classification", "segment"],
    TRANSACTIONAL: ["order", "invoice", "payment", "transaction", "shipment", "booking", "event", "activity", "receipt", "claim", "ticket", "interaction", "campaign_response"],
    MASTER:        ["customer", "product", "employee", "vendor", "supplier", "location", "user", "account", "item", "party", "organization", "asset", "member", "person"],
  },
  columnPatterns: {
    timestampSuffixes: ["_at", "_on", "_date", "_time"],
    timestampPrefixes: ["date", "time", "timestamp", "created", "updated", "modified"],
    keySuffixes: ["_id", "_fk"],
    codeNames: ["code"],
    nameSuffixes: ["name", "desc", "label", "title"],
  },
  systemPrefixes: { schema: ["sys", "pg_", "information_schema"], table: ["sys_", "pg_"] },
  weights: {
    systemPrefix: 6, nameKeyword: 4, timestampColumn: 2, manyKeyColumns: 2, oneKeyColumn: 1,
    largeTable: 2, smallWithCodeDesc: 4, smallTable: 2, wideEntity: 2, masterDefault: 1,
  },
  limits: { largeRows: 5000, smallMaxColumns: 6, smallMaxRows: 500, wideMinColumns: 5 },
  confidence: { highGap: 4, mediumGap: 2 },
};

export function classifyTableType(
  schemaName: string,
  table: { name: string; columns: { name: string }[]; rowCount?: number },
  cfg: TableTypeConfig = DEFAULT_TABLE_TYPE_CONFIG,
): { code: CategoryCode; confidence: ConfidenceCode } {
  const name = table.name.toLowerCase();
  const cols = table.columns.map(c => c.name.toLowerCase());
  const colCount = cols.length;
  const rowCount = table.rowCount;
  const w = cfg.weights, lim = cfg.limits;

  const score: Record<CategoryCode, number> = { MASTER: 0, TRANSACTIONAL: 0, REFERENCE: 0, SETUP: 0, SYSTEM: 0 };

  const pat = cfg.columnPatterns;
  const endsWithAny = (c: string, list: string[]) => list.some(x => x && c.endsWith(x));
  const startsWithAny = (c: string, list: string[]) => list.some(x => x && c.startsWith(x));
  const isCodeCol = (c: string) => pat.codeNames.some(x => x && (c === x || c.endsWith("_" + x)));

  // Strongest signal: system schema/table naming conventions.
  if (startsWithAny(schemaName.toLowerCase(), cfg.systemPrefixes.schema) || startsWithAny(name, cfg.systemPrefixes.table)) score.SYSTEM += w.systemPrefix;

  for (const category of CATEGORY_PRIORITY) {
    const hit = cfg.keywords[category].some(kw => kw && name.includes(kw));
    if (hit) score[category] += w.nameKeyword;
  }

  const timestampCols  = cols.filter(c => endsWithAny(c, pat.timestampSuffixes) || startsWithAny(c, pat.timestampPrefixes)).length;
  const fkLikeCols      = cols.filter(c => endsWithAny(c, pat.keySuffixes) && !isCodeCol(c)).length;
  const hasCodeDescPair = cols.some(isCodeCol) && cols.some(c => endsWithAny(c, pat.nameSuffixes));
  const isSmallStatic   = colCount > 0 && colCount <= lim.smallMaxColumns && (rowCount === undefined || rowCount < lim.smallMaxRows);
  const isLarge         = rowCount !== undefined && rowCount > lim.largeRows;

  if (timestampCols > 0)  score.TRANSACTIONAL += w.timestampColumn;
  if (fkLikeCols >= 2)    score.TRANSACTIONAL += w.manyKeyColumns;
  else if (fkLikeCols === 1) score.TRANSACTIONAL += w.oneKeyColumn;
  if (isLarge)             score.TRANSACTIONAL += w.largeTable;

  if (isSmallStatic && hasCodeDescPair) score.REFERENCE += w.smallWithCodeDesc;
  else if (isSmallStatic)               score.REFERENCE += w.smallTable;

  if (colCount >= lim.wideMinColumns && !hasCodeDescPair && fkLikeCols <= 1) score.MASTER += w.wideEntity;
  score.MASTER += w.masterDefault; // weak tie-breaker: the most common default when nothing else stands out

  const ranked = CATEGORY_PRIORITY
    .map(code => ({ code, points: score[code] }))
    .sort((a, b) => b.points - a.points || CATEGORY_PRIORITY.indexOf(a.code) - CATEGORY_PRIORITY.indexOf(b.code));
  const [top, second] = ranked;
  const gap = top.points - (second?.points ?? 0);
  const confidence: ConfidenceCode = gap >= cfg.confidence.highGap ? "HIGH" : gap >= cfg.confidence.mediumGap ? "MEDIUM" : "LOW";

  return { code: top.code, confidence };
}

/**
 * Fills anything missing from a stored configuration with the default, so a setting
 * added in a later release does not break a configuration saved before it.
 */
export function withTableTypeDefaults(stored: unknown): TableTypeConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<TableTypeConfig>;
  const d = DEFAULT_TABLE_TYPE_CONFIG;
  const keywords = { ...d.keywords };
  for (const code of CATEGORY_PRIORITY) {
    const list = s.keywords?.[code];
    if (Array.isArray(list)) keywords[code] = list.filter((k): k is string => typeof k === "string");
  }
  const list = (v: unknown, def: string[]) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : def);
  const columnPatterns = { ...d.columnPatterns };
  for (const key of COLUMN_PATTERN_KEYS) columnPatterns[key] = list(s.columnPatterns?.[key], d.columnPatterns[key]);
  return {
    keywords,
    columnPatterns,
    systemPrefixes: { schema: list(s.systemPrefixes?.schema, d.systemPrefixes.schema), table: list(s.systemPrefixes?.table, d.systemPrefixes.table) },
    weights: { ...d.weights, ...(s.weights ?? {}) },
    limits: { ...d.limits, ...(s.limits ?? {}) },
    confidence: { ...d.confidence, ...(s.confidence ?? {}) },
  };
}

/**
 * Checks a configuration sent by the screen and returns it cleaned (keywords trimmed,
 * lower-cased, de-duplicated), or the reason it cannot be saved.
 */
export function validateTableTypeConfig(input: unknown): { config: TableTypeConfig } | { error: string } {
  const c = withTableTypeDefaults(input);
  const keywords = {} as Record<CategoryCode, string[]>;
  for (const code of CATEGORY_PRIORITY) {
    const cleaned = Array.from(new Set(c.keywords[code].map((k) => k.trim().toLowerCase()).filter(Boolean)));
    if (cleaned.some((k) => k.length > 60)) return { error: "A keyword can be at most 60 characters." };
    if (cleaned.length > 200) return { error: "A table type can have at most 200 keywords." };
    keywords[code] = cleaned;
  }
  const clean = (items: string[]): string[] | string => {
    const cleaned = Array.from(new Set(items.map((k) => k.trim().toLowerCase()).filter(Boolean)));
    if (cleaned.some((k) => k.length > 60)) return "A pattern or prefix can be at most 60 characters.";
    if (cleaned.length > 100) return "A list can have at most 100 entries.";
    return cleaned;
  };
  const columnPatterns = {} as TableTypeColumnPatterns;
  for (const key of COLUMN_PATTERN_KEYS) {
    const r = clean(c.columnPatterns[key]);
    if (typeof r === "string") return { error: r };
    columnPatterns[key] = r;
  }
  const sysSchema = clean(c.systemPrefixes.schema), sysTable = clean(c.systemPrefixes.table);
  if (typeof sysSchema === "string") return { error: sysSchema };
  if (typeof sysTable === "string") return { error: sysTable };
  for (const [key, v] of Object.entries(c.weights)) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 20) return { error: `Points must be between 0 and 20 (${key} is ${v}).` };
  }
  for (const [key, v] of Object.entries(c.limits)) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 1_000_000_000) return { error: `Size limits must be whole numbers of 1 or more (${key} is ${v}).` };
  }
  const { highGap, mediumGap } = c.confidence;
  if (![highGap, mediumGap].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 40)) return { error: "The confidence gaps must be between 0 and 40." };
  if (mediumGap > highGap) return { error: "The Medium gap cannot be larger than the High gap." };
  return { config: { keywords, columnPatterns, systemPrefixes: { schema: sysSchema, table: sysTable }, weights: c.weights, limits: c.limits, confidence: c.confidence } };
}
