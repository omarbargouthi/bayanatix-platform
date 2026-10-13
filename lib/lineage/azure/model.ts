// Azure Data Factory / Azure Synapse crawler — step 2: read the definitions.
//
// Pure functions, no database: they turn linked services, datasets, pipelines, mapping
// data flows and notebooks into "this object feeds that object" statements, which
// lib/lineage/azure/ingest.ts then matches to the catalog and stores as lineage.
//
// What is and is not traced:
//   * Copy activities — source dataset to sink dataset, with the column mapping when
//     the activity states one. Dataset parameters are followed when the activity passes
//     a literal value; a value computed at run time (@item(), @pipeline().parameters…)
//     cannot be known from the definition and is reported, not guessed.
//   * Mapping data flows — the data flow script is read stream by stream, so each sink
//     column is traced back to the source columns it is built from.
//   * Notebooks — the code is searched for the tables and lake paths it reads and
//     writes. That is a text search, not an execution: names built from variables are
//     missed, and the result is table-level only and marked low confidence.
//   * Stored-procedure, script and other activities move data in ways the definition
//     does not describe; they are counted in the log and not traced.
import type { ExternalRef } from "../stitching";
import type { AzResource } from "./definitions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

// ── Linked services → where the data lives ───────────────────────────────────

export type Endpoint = { engine: string; host: string | null; database: string | null; kind: "DATABASE" | "STORAGE" | "OTHER"; lsType: string };

const DATABASE_ENGINES: Record<string, string> = {
  sqlserver: "MSSQL", azuresqldatabase: "MSSQL", azuresqlmi: "MSSQL", azuresqldw: "MSSQL", amazonrdsforsqlserver: "MSSQL",
  oracle: "ORACLE", amazonrdsfororacle: "ORACLE",
  postgresql: "POSTGRES", postgresqlv2: "POSTGRES", azurepostgresql: "POSTGRES",
  mysql: "MYSQL", azuremysql: "MYSQL", mariadb: "MYSQL",
  snowflake: "SNOWFLAKE", snowflakev2: "SNOWFLAKE",
};
const STORAGE_ENGINES: Record<string, string> = {
  azureblobfs: "ADLS", azuredatalakestore: "ADLS", azureblobstorage: "BLOB", azurefilestorage: "AZURE_FILES",
  amazons3: "S3", fileserver: "FILE_SERVER", sftp: "SFTP", ftpserver: "FTP",
};

/** A plain string value, or undefined when it is a secret reference or an expression. */
function plain(v: Json): string | undefined {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && v.type === "SecureString" && typeof v.value === "string") return v.value;
  return undefined;
}

function connectionStringParts(cs: string): Record<string, string> {
  const kv: Record<string, string> = {};
  for (const part of cs.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) kv[part.slice(0, eq).trim().toLowerCase().replace(/\s+/g, "")] = part.slice(eq + 1).trim();
  }
  return kv;
}

// "tcp:myserver.database.windows.net,1433" → "myserver.database.windows.net"
const cleanHost = (h: string | undefined) => (h ? h.replace(/^tcp:/i, "").replace(/[,:]\d+$/, "").trim() || null : null);
const hostOfUrl = (u: string | undefined) => (u ? u.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "").trim() || null : null);

export function parseLinkedService(ls: AzResource): Endpoint {
  const lsType = String(ls.properties?.type ?? "Unknown");
  const key = lsType.toLowerCase();
  const tp: Json = ls.properties?.typeProperties ?? {};

  if (STORAGE_ENGINES[key]) {
    const cs = connectionStringParts(plain(tp.connectionString) ?? "");
    const host = hostOfUrl(plain(tp.url) ?? plain(tp.serviceEndpoint) ?? plain(tp.dataLakeStoreUri) ?? plain(tp.host) ?? plain(tp.serviceUrl))
      ?? (cs.accountname ? `${cs.accountname}.blob.${cs.endpointsuffix ?? "core.windows.net"}` : null);
    return { engine: STORAGE_ENGINES[key], host, database: null, kind: "STORAGE", lsType };
  }

  const engine = DATABASE_ENGINES[key];
  if (engine) {
    const cs = connectionStringParts(plain(tp.connectionString) ?? "");
    const host = cleanHost(plain(tp.server) ?? plain(tp.host) ?? cs.server ?? cs.datasource ?? cs.host ?? cs.address ?? cs.addr ?? plain(tp.accountIdentifier));
    const database = plain(tp.database) ?? cs.database ?? cs.initialcatalog ?? cs.sid ?? cs.servicename ?? plain(tp.sid) ?? plain(tp.serviceName) ?? null;
    return { engine, host, database: database || null, kind: "DATABASE", lsType };
  }

  // Anything else (REST, SAP, Salesforce, Databricks…): kept under its own type name.
  return { engine: lsType.toUpperCase().slice(0, 20), host: hostOfUrl(plain(tp.url) ?? plain(tp.host) ?? plain(tp.server)), database: plain(tp.database) ?? null, kind: "OTHER", lsType };
}

// ── Datasets → the table or file they stand for ─────────────────────────────

export type ObjectRef = {
  ref: ExternalRef;
  isFile: boolean;
  /** Human-readable "engine: db.schema.table", for the log and the process description. */
  label: string;
  /** Column names the definition itself lists, when it does. */
  columns: string[];
};
export type Resolved = { ok: true; object: ObjectRef } | { ok: false; reason: string };

type Params = Record<string, Json>;

/**
 * A property value as text. Expressions are followed only as far as dataset parameters
 * that were given a literal value; anything else is "cannot be known" (undefined), and
 * the reason is added to `unknown`.
 */
function literal(v: Json, params: Params, unknown: string[]): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v !== "object" || v.type !== "Expression" || typeof v.value !== "string") return undefined;
  const expr: string = v.value.trim();
  const whole = expr.match(/^@dataset\(\)\.(\w+)$/);
  const lookup = (name: string): string | undefined => {
    const p = params[name];
    if (typeof p === "string" && !p.trim().startsWith("@")) return p;
    if (typeof p === "number") return String(p);
    unknown.push(p === undefined ? `parameter "${name}" has no value` : `parameter "${name}" is set at run time (${typeof p === "string" ? p : p?.value ?? "expression"})`);
    return undefined;
  };
  if (whole) return lookup(whole[1]);
  // String interpolation: "raw/@{dataset().Folder}/data"
  if (!expr.startsWith("@") || expr.startsWith("@{")) {
    let failed = false;
    const text = expr.replace(/@\{\s*dataset\(\)\.(\w+)\s*\}/g, (_m, name: string) => { const x = lookup(name); if (x === undefined) failed = true; return x ?? ""; });
    if (failed) return undefined;
    if (!text.includes("@{")) return text;
  }
  unknown.push(`value is computed at run time (${expr.length > 60 ? expr.slice(0, 57) + "…" : expr})`);
  return undefined;
}

const unquote = (s: string) => s.trim().replace(/^[\["`]|[\]"`]$/g, "");

/** "dbo.Customers", "[dbo].[Customers]", "db.schema.table" → schema + table. */
export function splitTableName(raw: string): { database: string | null; schema: string | null; table: string } {
  const parts = raw.match(/\[[^\]]+\]|"[^"]+"|`[^`]+`|[^.]+/g)?.map(unquote).filter(Boolean) ?? [raw];
  const table = parts[parts.length - 1];
  return { database: parts.length >= 3 ? parts[parts.length - 3] : null, schema: parts.length >= 2 ? parts[parts.length - 2] : null, table };
}

function fileObject(endpoint: Endpoint, container: string | undefined, folder: string | undefined, file: string | undefined): Resolved {
  const segments = [folder, file].filter(Boolean).join("/").split("/").map((s) => s.trim()).filter(Boolean);
  if (!container && segments.length === 0) return { ok: false, reason: "the dataset names no container, folder or file" };
  // The last part of the path is the object (a file, or the folder a partitioned set is written to).
  const object = segments.length > 0 ? segments[segments.length - 1] : container!;
  const schema = segments.length > 1 ? segments.slice(0, -1).join("/") : "/";
  const ref: ExternalRef = { engine: endpoint.engine, host: endpoint.host, database: container ?? null, schema, object };
  return { ok: true, object: { ref, isFile: true, columns: [], label: `${endpoint.engine}: ${[container, ...segments].filter(Boolean).join("/")}` } };
}

function tableObject(endpoint: Endpoint, database: string | null, schema: string | null, table: string, columns: string[] = []): Resolved {
  const ref: ExternalRef = { engine: endpoint.engine, host: endpoint.host, database: database ?? endpoint.database, schema, object: table };
  return { ok: true, object: { ref, isFile: false, columns, label: `${endpoint.engine}: ${[ref.database, schema, table].filter(Boolean).join(".")}` } };
}

export type Catalog = {
  endpoints: Map<string, Endpoint>;
  datasets: Map<string, AzResource>;
};

export function buildCatalog(linkedServices: AzResource[], datasets: AzResource[]): Catalog {
  return {
    endpoints: new Map(linkedServices.map((ls) => [ls.name, parseLinkedService(ls)])),
    datasets: new Map(datasets.map((d) => [d.name, d])),
  };
}

/** The table or file a dataset reference stands for, given the parameter values the reference passes. */
export function resolveDataset(reference: Json, catalog: Catalog): Resolved {
  const name = reference?.referenceName;
  if (typeof name !== "string") return { ok: false, reason: "no dataset is referenced" };
  const ds = catalog.datasets.get(name);
  if (!ds) return { ok: false, reason: `dataset "${name}" is not among the definitions` };

  const props = ds.properties ?? {};
  const lsName = props.linkedServiceName?.referenceName;
  const endpoint = catalog.endpoints.get(lsName);
  if (!endpoint) return { ok: false, reason: `dataset "${name}": linked service "${lsName ?? "?"}" is not among the definitions` };

  // Declared defaults first, then what the activity passes.
  const params: Params = {};
  for (const [k, def] of Object.entries(props.parameters ?? {})) {
    const d = (def as Json)?.defaultValue;
    if (d !== undefined && d !== null && d !== "") params[k] = d;
  }
  for (const [k, v] of Object.entries(reference.parameters ?? {})) params[k] = (v as Json)?.type === "Expression" ? (v as Json).value : v;

  const tp: Json = props.typeProperties ?? {};
  const unknown: string[] = [];
  const fail = (what: string): Resolved => ({ ok: false, reason: `dataset "${name}": ${what}${unknown.length ? ` — ${[...new Set(unknown)].join("; ")}` : ""}` });
  const columns = (Array.isArray(props.schema) ? props.schema : Array.isArray(props.structure) ? props.structure : [])
    .map((c: Json) => c?.name).filter((c: unknown): c is string => typeof c === "string");

  // File-format datasets (DelimitedText, Parquet, Json, …) carry a location; the older
  // AzureBlob / AzureBlobFSFile types carry folderPath ("container/folder") and fileName.
  if (tp.location || endpoint.kind === "STORAGE") {
    const loc: Json = tp.location ?? {};
    let container = literal(loc.fileSystem ?? loc.container ?? loc.bucketName, params, unknown);
    let folder = literal(loc.folderPath ?? tp.folderPath, params, unknown);
    const file = literal(loc.fileName ?? tp.fileName, params, unknown);
    if (!tp.location && folder && !container) {
      const parts = folder.split("/").filter(Boolean);
      container = parts.shift();
      folder = parts.join("/");
    }
    if (unknown.length > 0) return fail("its location cannot be read from the definition");
    const res = fileObject(endpoint, container, folder, file);
    if (res.ok) res.object.columns = columns;
    return res.ok ? res : fail(res.reason);
  }

  const schema = literal(tp.schema, params, unknown);
  const table = literal(tp.table, params, unknown);
  const tableName = table === undefined ? literal(tp.tableName, params, unknown) : undefined;
  if (unknown.length > 0) return fail("its table cannot be read from the definition");
  if (table) return tableObject(endpoint, null, schema ?? null, table, columns);
  if (tableName) {
    const t = splitTableName(tableName);
    return tableObject(endpoint, null, schema ?? t.schema, t.table, columns);
  }
  return fail("it names no table (the activity supplies a query instead)");
}

// ── Pipelines → Copy activities, and what else they run ─────────────────────

export type ColumnPair = { source: string; sink: string };
export type CopyOp = {
  activity: string;
  /** The activity with the containers it sits in: "ForEach Table / Copy One". */
  path: string;
  source: Resolved; sink: Resolved;
  /** The query the source runs instead of reading the whole table, when it is a fixed text. */
  query: string | null;
  /** The source query is built at run time. */
  dynamicQuery: boolean;
  /** Column mapping stated by the activity; null = ADF's default (same-named columns). */
  mapping: ColumnPair[] | null;
};
export type PipelineModel = {
  name: string;
  copies: CopyOp[];
  dataFlows: string[];
  notebooks: string[];
  childPipelines: string[];
  /** Activities that move data without saying what (stored procedure, script…): type → count. */
  untraced: Record<string, number>;
  activityCount: number;
};

const UNTRACED_TYPES = new Set(["SqlServerStoredProcedure", "Script", "DatabricksNotebook", "DatabricksSparkPython", "DatabricksSparkJar", "SparkJob", "HDInsightSpark", "Custom", "AzureFunctionActivity", "SynapseSparkJobDefinitionActivity", "ExecuteSSISPackage", "Delete"]);

function parseTranslator(t: Json): ColumnPair[] | null {
  if (!t || typeof t !== "object" || t.type === "Expression") return null;
  if (Array.isArray(t.mappings)) {
    const pairs = t.mappings
      .map((m: Json) => ({ source: m?.source?.name ?? m?.source?.path, sink: m?.sink?.name ?? m?.sink?.path }))
      .filter((p: Json) => typeof p.source === "string" && typeof p.sink === "string")
      // Hierarchical paths ("$['customer']['id']") are named by their last key.
      .map((p: ColumnPair) => ({ source: p.source.replace(/^.*\['([^']+)'\]$/, "$1"), sink: p.sink.replace(/^.*\['([^']+)'\]$/, "$1") }));
    return pairs.length > 0 ? pairs : null;
  }
  // Older form: "a: b, c: d" or { a: "b" }.
  const cm = t.columnMappings;
  if (typeof cm === "string") {
    const pairs = cm.split(",").map((p) => p.split(":").map((x) => x.trim())).filter((p) => p.length === 2 && p[0] && p[1]).map(([source, sink]) => ({ source, sink }));
    return pairs.length > 0 ? pairs : null;
  }
  if (cm && typeof cm === "object") {
    const pairs = Object.entries(cm).filter(([, v]) => typeof v === "string").map(([source, sink]) => ({ source, sink: sink as string }));
    return pairs.length > 0 ? pairs : null;
  }
  return null;
}

function nestedActivities(a: Json): Json[] {
  const tp = a?.typeProperties ?? {};
  return [
    ...(Array.isArray(tp.activities) ? tp.activities : []),
    ...(Array.isArray(tp.ifTrueActivities) ? tp.ifTrueActivities : []),
    ...(Array.isArray(tp.ifFalseActivities) ? tp.ifFalseActivities : []),
    ...(Array.isArray(tp.defaultActivities) ? tp.defaultActivities : []),
    ...(Array.isArray(tp.cases) ? tp.cases.flatMap((c: Json) => (Array.isArray(c?.activities) ? c.activities : [])) : []),
  ];
}

export function parsePipeline(pipeline: AzResource, catalog: Catalog): PipelineModel {
  const model: PipelineModel = { name: pipeline.name, copies: [], dataFlows: [], notebooks: [], childPipelines: [], untraced: {}, activityCount: 0 };
  const add = (list: string[], v: unknown) => { if (typeof v === "string" && !list.includes(v)) list.push(v); };

  const walk = (activities: Json[], trail: string[]) => {
    for (const a of activities) {
      if (!a || typeof a !== "object") continue;
      model.activityCount++;
      const name = String(a.name ?? a.type ?? "activity");
      const tp: Json = a.typeProperties ?? {};
      switch (a.type) {
        case "Copy": {
          const src: Json = tp.source ?? {};
          const q = src.sqlReaderQuery ?? src.query ?? src.oracleReaderQuery;
          model.copies.push({
            activity: name, path: [...trail, name].join(" / "),
            source: resolveDataset(a.inputs?.[0], catalog), sink: resolveDataset(a.outputs?.[0], catalog),
            query: typeof q === "string" && !q.trim().startsWith("@") ? q : null,
            dynamicQuery: q !== undefined && q !== null && !(typeof q === "string" && !q.trim().startsWith("@")),
            mapping: parseTranslator(tp.translator),
          });
          break;
        }
        case "ExecuteDataFlow": add(model.dataFlows, (tp.dataflow ?? tp.dataFlow)?.referenceName); break;
        case "SynapseNotebook": add(model.notebooks, tp.notebook?.referenceName); break;
        case "ExecutePipeline": add(model.childPipelines, tp.pipeline?.referenceName); break;
        default:
          if (UNTRACED_TYPES.has(a.type)) model.untraced[a.type] = (model.untraced[a.type] ?? 0) + 1;
      }
      const inner = nestedActivities(a);
      if (inner.length > 0) walk(inner, [...trail, name]);
    }
  };
  walk(Array.isArray(pipeline.properties?.activities) ? pipeline.properties.activities : [], []);
  return model;
}

// ── Mapping data flows → the data flow script, stream by stream ─────────────

export type FlowColumn = {
  sink: string;
  /** Source stream name + column the sink column is built from. */
  origins: { stream: string; column: string }[];
  kind: "DIRECT" | "EXPRESSION" | "AGGREGATION";
};
export type FlowSink = {
  stream: string; target: Resolved;
  /** Source streams that reach this sink. */
  sourceStreams: string[];
  columns: FlowColumn[];
};
export type DataFlowModel = {
  name: string;
  script: string;
  sources: { stream: string; object: Resolved }[];
  sinks: FlowSink[];
  transformations: string[];
  warnings: string[];
};

/** Splits at top-level occurrences of `sep`, respecting quotes, brackets and braces. */
export function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0, quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (depth === 0 && text.startsWith(sep, i)) { out.push(text.slice(start, i)); start = i + sep.length; i += sep.length - 1; }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Index of the first top-level `ch` (outside quotes and brackets), or -1. */
function indexTop(text: string, test: (text: string, i: number) => boolean): number {
  let depth = 0, quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (depth === 0 && test(text, i)) return i;
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
  }
  return -1;
}

// A column name is written bare or, when it has spaces, in braces: {Customer Name}.
const colName = (s: string) => s.trim().replace(/^\{(.*)\}$/, "$1").trim();
const stripStrings = (s: string) => s.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, " ");

type Stmt = { inputs: string[]; op: string; args: string[]; outputs: string[] };

function parseStatements(script: string): Stmt[] {
  // Comments first ("// …" lines and "/* … */"), keeping "//" inside strings such as URLs.
  const clean = script
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/).map((line) => { const i = indexTop(line, (t, k) => t.startsWith("//", k)); return i >= 0 ? line.slice(0, i) : line; }).join("\n");

  const stmts: Stmt[] = [];
  let rest = clean;
  for (;;) {
    const arrow = indexTop(rest, (t, i) => t.startsWith("~>", i));
    if (arrow < 0) break;
    const body = rest.slice(0, arrow).trim();
    const after = rest.slice(arrow + 2);
    // The output name: "Name" or, for a split, "Name@(first, second)".
    const m = after.match(/^\s*([A-Za-z_][\w]*)(?:@\(([^)]*)\))?/);
    if (!m) break;
    rest = after.slice(m[0].length);
    const outputs = m[2] ? m[2].split(",").map((s) => `${m[1]}@${s.trim()}`) : [m[1]];

    const open = indexTop(body, (t, i) => t[i] === "(");
    if (open < 0) continue;
    const head = body.slice(0, open).trim();
    const close = body.lastIndexOf(")");
    const args = splitTop(body.slice(open + 1, close > open ? close : body.length), ",");
    // "In1, In2 join" → inputs In1 and In2, operation join. "source" has no input.
    const headParts = head.split(/\s+/);
    const op = headParts.pop() ?? "";
    const inputs = headParts.join(" ").split(",").map((s) => s.trim()).filter(Boolean);
    stmts.push({ inputs, op: op.toLowerCase(), args, outputs });
  }
  return stmts;
}

/** A "name(…)" argument's inner list, e.g. the columns of output(…) or mapColumn(…). */
function innerOf(args: string[], fn: string): string[] | null {
  const a = args.find((x) => new RegExp(`^${fn}\\s*\\(`, "i").test(x));
  if (!a) return null;
  return splitTop(a.slice(a.indexOf("(") + 1, a.lastIndexOf(")")), ",");
}

/** A "name: 'value'" argument's text value. */
function namedArg(args: string[], name: string): string | undefined {
  for (const a of args) {
    const m = a.match(new RegExp(`^${name}\\s*:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1\\s*$`, "i"));
    if (m) return m[2];
  }
  return undefined;
}

/** "name = expression" with a single "=" at top level (not "==", "<=", ">=", "!="). */
function assignment(arg: string): { name: string; expr: string } | null {
  const i = indexTop(arg, (t, k) => t[k] === "=" && t[k + 1] !== "=" && !"=<>!".includes(t[k - 1] ?? ""));
  if (i <= 0) return null;
  return { name: colName(arg.slice(0, i)), expr: arg.slice(i + 1).trim() };
}

type Col = { name: string; origins: Set<string>; kind: FlowColumn["kind"] };
type Stream = { cols: Map<string, Col>; sources: Set<string> };

const AGG_KIND = (a: FlowColumn["kind"], b: FlowColumn["kind"]): FlowColumn["kind"] =>
  a === "AGGREGATION" || b === "AGGREGATION" ? "AGGREGATION" : a === "EXPRESSION" || b === "EXPRESSION" ? "EXPRESSION" : "DIRECT";

/** The input columns an expression mentions. */
function columnsUsed(expr: string, input: Map<string, Col>): Col[] {
  const text = stripStrings(expr);
  const used: Col[] = [];
  for (const col of input.values()) {
    const braced = text.includes(`{${col.name}}`);
    const bare = /^[A-Za-z_]\w*$/.test(col.name) && new RegExp(`(?<![\\w$@.])${col.name}(?![\\w(])`).test(text);
    if (braced || bare) used.push(col);
  }
  return used;
}

function derived(name: string, expr: string, input: Map<string, Col>, kind: FlowColumn["kind"]): Col {
  const used = columnsUsed(expr, input);
  // "x = y" on its own is a rename, not a calculation.
  const same = used.length === 1 && colName(expr).toLowerCase() === used[0].name.toLowerCase();
  const col: Col = { name, origins: new Set(), kind: same ? used[0].kind : kind };
  for (const u of used) { u.origins.forEach((o) => col.origins.add(o)); if (!same) col.kind = AGG_KIND(col.kind, u.kind); }
  return col;
}

const copyCols = (m: Map<string, Col>) => new Map([...m].map(([k, c]) => [k, { ...c, origins: new Set(c.origins) }]));

/** A source or sink written inline in the script (no dataset): store / table / path arguments. */
function inlineObject(args: string[], endpoint: Endpoint | undefined): Resolved {
  const table = namedArg(args, "tableName") ?? namedArg(args, "table");
  const schema = namedArg(args, "schemaName") ?? namedArg(args, "schema");
  const database = namedArg(args, "database") ?? namedArg(args, "databaseName");
  const container = namedArg(args, "fileSystem") ?? namedArg(args, "container");
  const folder = namedArg(args, "folderPath");
  const file = namedArg(args, "fileName");
  if (table) {
    // A workspace (lake) database table has no linked service; it lives in the Spark catalog.
    const ep = endpoint ?? { engine: "SPARK", host: null, database: null, kind: "DATABASE" as const, lsType: "WorkspaceDB" };
    return tableObject(ep, endpoint ? null : null, schema ?? database ?? null, table);
  }
  if (container || folder || file) {
    if (!endpoint) return { ok: false, reason: "an inline file source without a linked service" };
    return fileObject(endpoint, container, folder, file);
  }
  return { ok: false, reason: "neither a dataset nor an inline table or path is given" };
}

export function parseDataFlow(flow: AzResource, catalog: Catalog): DataFlowModel {
  const tp: Json = flow.properties?.typeProperties ?? {};
  const script: string = typeof tp.script === "string" ? tp.script : Array.isArray(tp.scriptLines) ? tp.scriptLines.join("\n") : "";
  const model: DataFlowModel = { name: flow.name, script, sources: [], sinks: [], transformations: [], warnings: [] };
  if (!script.trim()) { model.warnings.push("the data flow has no script"); return model; }

  const declared = (list: Json): Map<string, Json> => new Map((Array.isArray(list) ? list : []).filter((x: Json) => typeof x?.name === "string").map((x: Json) => [x.name, x]));
  const sourceDefs = declared(tp.sources), sinkDefs = declared(tp.sinks);
  const objectOf = (def: Json, args: string[]): Resolved => {
    if (def?.dataset?.referenceName) return resolveDataset(def.dataset, catalog);
    return inlineObject(args, catalog.endpoints.get(def?.linkedService?.referenceName));
  };

  const streams = new Map<string, Stream>();
  const approximate = new Set<string>();
  const get = (name: string): Stream => streams.get(name) ?? { cols: new Map(), sources: new Set() };

  for (const st of parseStatements(script)) {
    const out = st.outputs[0];
    const ins = st.inputs.map(get);
    const first = ins[0] ?? { cols: new Map<string, Col>(), sources: new Set<string>() };
    const sources = new Set<string>(ins.flatMap((s) => [...s.sources]));
    let cols = copyCols(first.cols);

    switch (st.op) {
      case "source": {
        cols = new Map();
        for (const c of innerOf(st.args, "output") ?? []) {
          // "name as type" — the type may itself contain " as " inside brackets, so split at the first.
          const i = indexTop(c, (t, k) => /^\s+as\s/i.test(t.slice(k, k + 4)));
          const name = colName(i > 0 ? c.slice(0, i) : c);
          if (name) cols.set(name.toLowerCase(), { name, origins: new Set([`${out}\u0000${name}`]), kind: "DIRECT" });
        }
        sources.add(out);
        model.sources.push({ stream: out, object: objectOf(sourceDefs.get(out), st.args) });
        break;
      }
      case "sink": {
        const mapped = innerOf(st.args, "mapColumn");
        const sinkCols: Col[] = [];
        if (mapped) {
          for (const m of mapped) {
            const a = assignment(m);
            if (a) sinkCols.push(derived(a.name, a.expr, first.cols, "EXPRESSION"));
            else { const c = first.cols.get(colName(m).toLowerCase()); if (c) sinkCols.push(c); }
          }
        } else {
          sinkCols.push(...first.cols.values()); // auto-mapping: every incoming column, same name
        }
        model.sinks.push({
          stream: out, target: objectOf(sinkDefs.get(out), st.args), sourceStreams: [...sources],
          columns: sinkCols.filter((c) => c.origins.size > 0).map((c) => ({
            sink: c.name, kind: c.kind,
            origins: [...c.origins].map((o) => { const [stream, column] = o.split("\u0000"); return { stream, column }; }),
          })),
        });
        break;
      }
      case "select": {
        const mapped = innerOf(st.args, "mapColumn");
        if (mapped && !mapped.some((m) => /^each\s*\(/i.test(m))) {
          cols = new Map();
          for (const m of mapped) {
            const a = assignment(m);
            if (a) cols.set(a.name.toLowerCase(), derived(a.name, a.expr, first.cols, "EXPRESSION"));
            else { const c = first.cols.get(colName(m).toLowerCase()); if (c) cols.set(c.name.toLowerCase(), { ...c, origins: new Set(c.origins) }); }
          }
        }
        break;
      }
      case "derive": case "window": case "cast": case "parse": case "stringify": case "alterrow": case "rank": case "keygenerate": {
        for (const arg of st.args) {
          const a = assignment(arg);
          if (a) cols.set(a.name.toLowerCase(), derived(a.name, a.expr, first.cols, "EXPRESSION"));
        }
        break;
      }
      case "aggregate": {
        cols = new Map();
        for (const g of innerOf(st.args, "groupBy") ?? []) {
          const a = assignment(g);
          if (a) cols.set(a.name.toLowerCase(), derived(a.name, a.expr, first.cols, "EXPRESSION"));
          else { const c = first.cols.get(colName(g).toLowerCase()); if (c) cols.set(c.name.toLowerCase(), { ...c, origins: new Set(c.origins) }); }
        }
        for (const arg of st.args) {
          if (/^groupBy\s*\(/i.test(arg)) continue;
          const a = assignment(arg);
          if (a) cols.set(a.name.toLowerCase(), derived(a.name, a.expr, first.cols, "AGGREGATION"));
        }
        break;
      }
      case "join": case "lookup": case "union": {
        // Columns of every input; on a name clash the first input's column is kept.
        for (const s of ins.slice(1)) for (const [k, c] of s.cols) if (!cols.has(k)) cols.set(k, { ...c, origins: new Set(c.origins) });
        break;
      }
      case "exists": case "filter": case "sort": case "split": case "assert": case "distinct":
        break; // same columns as the (first) input
      default:
        // pivot, unpivot, flatten, flowlet calls…: columns are passed through as they are,
        // which may miss columns the step creates.
        approximate.add(st.op);
        for (const s of ins.slice(1)) for (const [k, c] of s.cols) if (!cols.has(k)) cols.set(k, { ...c, origins: new Set(c.origins) });
    }

    if (st.op !== "source" && st.op !== "sink") model.transformations.push(`${st.op} ${out}`);
    for (const o of st.outputs) streams.set(o, { cols: copyCols(cols), sources: new Set(sources) });
  }

  if (approximate.size > 0) model.warnings.push(`column lineage is approximate through: ${[...approximate].join(", ")}`);
  if (model.sinks.length === 0) model.warnings.push("no sink was found in the script");
  return model;
}

// ── Notebooks → the tables and paths the code reads and writes ──────────────

export type NotebookModel = {
  name: string;
  language: string;
  code: string;
  reads: ObjectRef[];
  writes: ObjectRef[];
  warnings: string[];
};

const FORMAT_WORDS = new Set(["delta", "parquet", "csv", "json", "orc", "avro", "text", "jdbc", "hive", "select", "values", "table", "lateral", "unnest", "explode", "range"]);

function pathObject(p: string): ObjectRef | null {
  const trimmed = p.trim();
  // abfss://container@account.dfs.core.windows.net/folder/file
  const m = trimmed.match(/^(abfss?|wasbs?):\/\/([^@/]+)@([^/]+)\/?(.*)$/i);
  let engine = "ADLS", host: string | null = null, container: string | null = null, rest = trimmed;
  if (m) { engine = m[1].toLowerCase().startsWith("wasb") ? "BLOB" : "ADLS"; container = m[2]; host = m[3]; rest = m[4]; }
  else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return null; // some other protocol
  const segments = rest.split("/").map((s) => s.trim()).filter((s) => s && s !== "*" && !s.includes("*"));
  if (segments.length === 0 && !container) return null;
  const object = segments.length > 0 ? segments[segments.length - 1] : container!;
  const schema = segments.length > 1 ? segments.slice(0, -1).join("/") : "/";
  return { ref: { engine, host, database: container, schema, object }, isFile: true, columns: [], label: `${engine}: ${[container, ...segments].filter(Boolean).join("/")}` };
}

function sparkTable(name: string, catalogName: string): ObjectRef | null {
  const t = splitTableName(name.trim());
  if (!/^[\w$]+$/.test(t.table)) return null;
  const schema = t.schema ?? "default";
  // The workspace stands in for the host, so "silver.orders" of two workspaces stay apart.
  return { ref: { engine: "SPARK", host: catalogName, database: null, schema, object: t.table }, isFile: false, columns: [], label: `SPARK: ${schema}.${t.table}` };
}

function sqlPoolTable(name: string): ObjectRef | null {
  const t = splitTableName(name.trim());
  if (!t.schema) return null;
  return { ref: { engine: "MSSQL", host: null, database: t.database, schema: t.schema, object: t.table }, isFile: false, columns: [], label: `MSSQL: ${[t.database, t.schema, t.table].filter(Boolean).join(".")}` };
}

/**
 * Reads the code of a Synapse notebook. `catalogName` names the Spark catalog its tables
 * belong to (the connection's name), so "silver.orders" in two workspaces stay apart.
 */
export function parseNotebook(nb: AzResource, catalogName: string): NotebookModel {
  const props = nb.properties ?? {};
  const language = String(props.metadata?.language_info?.name ?? props.metadata?.kernelspec?.language ?? "python").toLowerCase();
  const cells: Json[] = Array.isArray(props.cells) ? props.cells : [];
  const model: NotebookModel = { name: nb.name, language, code: "", reads: [], writes: [], warnings: [] };

  const reads = new Map<string, ObjectRef>(), writes = new Map<string, ObjectRef>();
  const tempViews = new Set<string>();
  const key = (o: ObjectRef) => [o.ref.engine, o.ref.host, o.ref.database, o.ref.schema, o.ref.object].join("|").toLowerCase();
  const put = (into: Map<string, ObjectRef>, o: ObjectRef | null) => { if (o) into.set(key(o), o); };
  let dynamic = 0;

  const scanSql = (sqlText: string) => {
    const text = sqlText.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    const ctes = new Set([...text.matchAll(/(?:\bWITH|,)\s+([A-Za-z_]\w*)\s+AS\s*\(/gi)].map((m) => m[1].toLowerCase()));
    for (const statement of text.split(";")) {
      const hasSelect = /\bSELECT\b/i.test(statement);
      const targets = new Set<string>();
      for (const m of statement.matchAll(/\b(INSERT\s+(?:INTO|OVERWRITE)(?:\s+TABLE)?|CREATE\s+(?:OR\s+REPLACE\s+)?(?:EXTERNAL\s+)?TABLE(?:\s+IF\s+NOT\s+EXISTS)?|REPLACE\s+TABLE|MERGE\s+INTO)\s+([`\w.]+)/gi)) {
        // CREATE TABLE without a SELECT only declares the table; it moves no data.
        if (/^CREATE|^REPLACE/i.test(m[1]) && !hasSelect) continue;
        targets.add(m[2].replace(/`/g, "").toLowerCase());
        put(writes, sparkTable(m[2], catalogName));
      }
      for (const m of statement.matchAll(/\b(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:GLOBAL\s+)?(?:TEMP|TEMPORARY)\s+VIEW)\s+([`\w.]+)/gi)) tempViews.add(m[1].replace(/`/g, "").toLowerCase());
      for (const m of statement.matchAll(/\b(?:FROM|JOIN|USING)\s+(delta|parquet|csv|json|orc)\.`([^`]+)`/gi)) put(reads, pathObject(m[2]));
      for (const m of statement.matchAll(/\b(?:FROM|JOIN|USING)\s+((?:`[^`]+`|\w+)(?:\.(?:`[^`]+`|\w+)){0,2})/gi)) {
        const name = m[1].replace(/`/g, "");
        const lower = name.toLowerCase();
        if (FORMAT_WORDS.has(lower.split(".")[0]) || ctes.has(lower) || targets.has(lower)) continue;
        put(reads, sparkTable(name, catalogName));
      }
    }
  };

  const scanCode = (code: string) => {
    for (const m of code.matchAll(/createOrReplace(?:Global)?TempView\(\s*["']([^"']+)["']/g)) tempViews.add(m[1].toLowerCase());
    // SQL passed to spark.sql("…") / spark.sql("""…""") / spark.sql(f"…") without placeholders.
    for (const m of code.matchAll(/\.sql\(\s*(?:[frb]{0,2})("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/g)) {
      scanSql(m[1].replace(/^("""|'''|"|')|("""|'''|"|')$/g, ""));
    }
    for (const m of code.matchAll(/spark\s*\.\s*(?:read\s*\.\s*)?table\(\s*["']([^"']+)["']\s*\)/g)) put(reads, sparkTable(m[1], catalogName));
    for (const m of code.matchAll(/\.read\b(?:(?!\.write\b)[\s\S]){0,400}?\.\s*(load|parquet|csv|json|orc|text|delta|synapsesql)\(\s*["']([^"']+)["']/g)) {
      put(reads, m[1] === "synapsesql" ? sqlPoolTable(m[2]) : pathObject(m[2]));
    }
    for (const m of code.matchAll(/\.write(?:Stream)?\b(?:(?!\.read\b)[\s\S]){0,400}?\.\s*(saveAsTable|insertInto|toTable|save|start|parquet|csv|json|orc|text|delta|synapsesql)\(\s*["']([^"']+)["']/g)) {
      put(writes, m[1] === "synapsesql" ? sqlPoolTable(m[2]) : ["saveAsTable", "insertInto", "toTable"].includes(m[1]) ? sparkTable(m[2], catalogName) : pathObject(m[2]));
    }
    for (const m of code.matchAll(/\.writeTo\(\s*["']([^"']+)["']/g)) put(writes, sparkTable(m[1], catalogName));
    // A Delta table opened by path or name is written to when it is merged into, updated or deleted from.
    const mutates = /\.\s*(merge|update|delete)\s*\(/.test(code);
    for (const m of code.matchAll(/DeltaTable\s*\.\s*forPath\(\s*\w+\s*,\s*["']([^"']+)["']/g)) put(mutates ? writes : reads, pathObject(m[1]));
    for (const m of code.matchAll(/DeltaTable\s*\.\s*forName\(\s*\w+\s*,\s*["']([^"']+)["']/g)) put(mutates ? writes : reads, sparkTable(m[1], catalogName));
    // Reads and writes whose table or path is a variable or an f-string cannot be followed.
    dynamic += [...code.matchAll(/\.\s*(?:load|save|saveAsTable|insertInto|table|synapsesql)\(\s*(?:f["']|[A-Za-z_][\w.]*\s*[,)+])/g)].length;
  };

  const parts: string[] = [];
  for (const cell of cells) {
    if (cell?.cell_type !== "code") continue;
    const text = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source ?? "");
    if (!text.trim()) continue;
    parts.push(text);
    const magic = text.match(/^\s*%%(\w+)/)?.[1]?.toLowerCase();
    const body = magic ? text.replace(/^\s*%%\w+[^\n]*\n?/, "") : text;
    if (magic === "sql" || (!magic && language === "sql")) scanSql(body);
    else scanCode(body);
  }

  // A temporary view is a step inside the notebook, not a stored object.
  const isTemp = (o: ObjectRef) => !o.isFile && o.ref.engine === "SPARK" && (tempViews.has(o.ref.object.toLowerCase()) || tempViews.has(`${o.ref.schema}.${o.ref.object}`.toLowerCase()));
  model.reads = [...reads.values()].filter((o) => !isTemp(o));
  model.writes = [...writes.values()].filter((o) => !isTemp(o));
  // Reading back what the notebook itself wrote is not an input.
  const written = new Set(model.writes.map(key));
  model.reads = model.reads.filter((o) => !written.has(key(o)));
  model.code = parts.join("\n\n# ───── next cell ─────\n\n");
  if (dynamic > 0) model.warnings.push(`${dynamic} read/write call(s) name their table or path through a variable and could not be followed`);
  if (cells.length > 0 && parts.length === 0) model.warnings.push("the notebook has no code cells");
  return model;
}
