// FR-8 — SSIS scanner (C3), upload mode. Parses a .dtsx XML file (fast-xml-parser
// — never regex on XML), walks its Data Flow Task component graph via SSIS's own
// lineageId column identity, and persists processes + stitched data_lineage edges.
import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { Parser as SqlParser } from "node-sql-parser";
import { sql } from "../db";
import { ensureAttribute } from "./catalog-upsert";
import { resolveStitch, type ExternalRef, type Confidence } from "./stitching";

const ARRAY_TAGS = new Set([
  "DTS:ConnectionManager", "DTS:Executable", "component", "output", "input",
  "outputColumn", "inputColumn", "externalMetadataColumn", "property", "connection", "path",
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

// ── Connection string parsing (never extract credentials — redact & discard) ─

export type ParsedConnStr = { engine: string; host: string | null; port: number | null; database: string | null; redacted: string };

function redactPassword(cs: string): string {
  return cs.replace(/\b(password|pwd)\s*=\s*[^;]*/gi, "$1=***");
}

export function parseConnectionString(cs: string): ParsedConnStr {
  const redacted = redactPassword(cs);
  const lower = cs.toLowerCase();
  let engine = "UNKNOWN";
  if (lower.includes("oracle")) engine = "ORACLE";
  else if (lower.includes("postgresql") || lower.includes("postgres")) engine = "POSTGRES";
  else if (lower.includes("sql server") || lower.includes("sqlncli") || lower.includes("sqloledb") || lower.includes("msoledbsql")) engine = "MSSQL";

  // Oracle OLEDB-style: "Data Source=host[:port]/service;..."
  const dataSourceMatch = cs.match(/Data Source=([^;]+)/i);
  if (engine === "ORACLE" && dataSourceMatch) {
    const ds = dataSourceMatch[1].trim();
    const m = ds.match(/^([^:/]+)(?::(\d+))?\/(.+)$/);
    if (m) return { engine, host: m[1], port: m[2] ? Number(m[2]) : null, database: m[3], redacted };
    return { engine, host: ds, port: null, database: null, redacted };
  }

  // Generic key=value;key=value (ODBC / ADO.NET style)
  const kv: Record<string, string> = {};
  for (const part of cs.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    const v = part.slice(eq + 1).trim();
    if (k) kv[k] = v;
  }
  if (engine === "UNKNOWN" && kv["driver"]) {
    const d = kv["driver"].toLowerCase();
    if (d.includes("postgresql")) engine = "POSTGRES";
    else if (d.includes("sql server")) engine = "MSSQL";
    else if (d.includes("oracle")) engine = "ORACLE";
  }
  const host = kv["server"] ?? kv["host"] ?? kv["data source"] ?? null;
  const port = kv["port"] ? Number(kv["port"]) : null;
  const database = kv["database"] ?? kv["initial catalog"] ?? null;
  return { engine, host, port, database, redacted };
}

function sqlDialectFor(engine: string): "oracle" | "transactsql" | "postgresql" | null {
  if (engine === "ORACLE") return "oracle";
  if (engine === "MSSQL") return "transactsql";
  if (engine === "POSTGRES") return "postgresql";
  return null;
}

// Best-effort FROM-table extraction for AccessMode=2 (SQL command) sources — the
// authoritative column list still comes from outputColumns/externalMetadataColumns,
// this only determines which table the source reads (needed for stitching).
export function extractSourceTable(sqlCommand: string, engine: string): { schema: string | null; table: string } | null {
  const dialect = sqlDialectFor(engine);
  if (dialect) {
    try {
      const parser = new SqlParser();
      const ast = parser.astify(sqlCommand, { database: dialect }) as unknown;
      const stmt = Array.isArray(ast) ? ast[0] : ast;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const from = (stmt as any)?.from;
      if (from?.[0]?.table) return { schema: from[0].db ?? null, table: from[0].table };
    } catch {
      // fall through — a parse failure must never fail the scan (spec requirement)
    }
  }
  const m = sqlCommand.match(/\bFROM\s+([A-Za-z0-9_$]+)\.([A-Za-z0-9_$"]+)|\bFROM\s+([A-Za-z0-9_$"]+)/i);
  if (!m) return null;
  if (m[2]) return { schema: m[1], table: m[2].replace(/"/g, "") };
  if (m[3]) return { schema: null, table: m[3].replace(/"/g, "") };
  return null;
}

function unquoteTableName(raw: string): { schema: string | null; table: string } {
  // "stg"."stg_invoices" or [dbo].[Table] or bare Table
  const parts = raw.split(".").map((p) => p.trim().replace(/^["[]|["\]]$/g, ""));
  if (parts.length >= 2) return { schema: parts[parts.length - 2], table: parts[parts.length - 1] };
  return { schema: null, table: parts[0] };
}

// ── XML tree walking helpers ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Xml = any;
const asArr = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

function propValue(properties: Xml, name: string): string | null {
  const list = asArr(properties?.property);
  const p = list.find((x: Xml) => x.name === name);
  return p ? String(p["#text"] ?? "") : null;
}

// ── Component role classification ────────────────────────────────────────────

type Role = "SOURCE" | "DESTINATION" | "DERIVED_COLUMN" | "DATA_CONVERT" | "LOOKUP" | "MERGE_JOIN" | "AGGREGATE" | "PASSTHROUGH" | "CONDITIONAL_SPLIT" | "SCRIPT" | "OTHER";

function classifyComponent(componentClassID: string): Role {
  const c = componentClassID.toLowerCase();
  if (c.includes("source")) return "SOURCE";
  if (c.includes("destination") || c.includes("dst")) return "DESTINATION";
  if (c.includes("derivedcolumn")) return "DERIVED_COLUMN";
  if (c.includes("dataconvert")) return "DATA_CONVERT";
  if (c.includes("lookup")) return "LOOKUP";
  if (c.includes("mergejoin")) return "MERGE_JOIN";
  if (c.includes("aggregate")) return "AGGREGATE";
  if (c.includes("conditionalsplit")) return "CONDITIONAL_SPLIT";
  if (c.includes("unionall") || c.includes("sort") || c.includes("multicast")) return "PASSTHROUGH";
  if (c.includes("script")) return "SCRIPT";
  return "OTHER";
}

const ROLE_TRANSFORM: Record<Role, string> = {
  SOURCE: "DIRECT", DESTINATION: "DIRECT", DERIVED_COLUMN: "EXPRESSION", DATA_CONVERT: "CAST",
  LOOKUP: "LOOKUP", MERGE_JOIN: "JOIN", AGGREGATE: "AGGREGATION", PASSTHROUGH: "DIRECT",
  CONDITIONAL_SPLIT: "FILTER", SCRIPT: "UNKNOWN", OTHER: "DIRECT",
};

// ── Parsed component shape ───────────────────────────────────────────────────

type ParsedComponent = {
  refId: string; name: string; componentClassID: string; role: Role;
  connectionManagerRefId: string | null;
  table: { schema: string | null; table: string } | null; // SOURCE and DESTINATION components only
  inputColumns: { lineageId: string; cachedName: string; externalMetadataColumnId?: string }[];
  outputColumns: { lineageId: string; name: string; dataType: string | null; sourceLineageId?: string }[];
  inputExternalMetadata: { id: string; name: string; dataType: string | null }[]; // destination's real column names
};

function parseComponents(componentsXml: Xml, engineByConnRefId: Map<string, string>, warnings: string[]): ParsedComponent[] {
  return asArr(componentsXml?.component).map((c: Xml): ParsedComponent => {
    const role = classifyComponent(c.componentClassID);
    const conn = asArr(c.connections?.connection)[0];
    const connectionManagerRefId: string | null = conn?.connectionManagerRefId ?? null;
    const input = asArr(c.inputs?.input)[0];
    const output = asArr(c.outputs?.output)[0];

    let table: ParsedComponent["table"] = null;
    if (role === "SOURCE") {
      const accessMode = propValue(c.properties, "AccessMode");
      const sqlCommand = propValue(c.properties, "SqlCommand");
      const openRowset = propValue(c.properties, "OpenRowset") ?? propValue(c.properties, "TableOrViewName");
      if (accessMode === "2" && sqlCommand) {
        const engine = connectionManagerRefId ? engineByConnRefId.get(connectionManagerRefId) ?? "UNKNOWN" : "UNKNOWN";
        table = extractSourceTable(sqlCommand, engine);
        if (!table) warnings.push(`Source "${c.name}": could not parse the source table out of its SQL command — falling back to per-column UNKNOWN.`);
      } else if (openRowset) {
        table = unquoteTableName(openRowset);
      }
    } else if (role === "DESTINATION") {
      const tableNameProp = propValue(c.properties, "TableName") ?? propValue(c.properties, "OpenRowset");
      if (tableNameProp) table = unquoteTableName(tableNameProp);
      else warnings.push(`Destination "${c.name}": no TableName property found — using component name as the table name.`);
    }

    return {
      refId: c.refId, name: c.name, componentClassID: c.componentClassID, role,
      connectionManagerRefId, table,
      inputColumns: asArr(input?.inputColumns?.inputColumn).map((ic: Xml) => ({
        lineageId: String(ic.lineageId), cachedName: ic.cachedName, externalMetadataColumnId: ic.externalMetadataColumnId,
      })),
      outputColumns: asArr(output?.outputColumns?.outputColumn).map((oc: Xml) => ({
        lineageId: String(oc.lineageId), name: oc.name, dataType: oc.dataType ?? null,
        sourceLineageId: oc.sourceLineageId != null ? String(oc.sourceLineageId) : undefined,
      })),
      inputExternalMetadata: asArr(input?.externalMetadataColumns?.externalMetadataColumn).map((m: Xml) => ({
        id: m.id, name: m.name, dataType: m.dataType ?? null,
      })),
    };
  });
}

// ── Column-lineage graph walk (SSIS's own lineageId chain) ──────────────────

type ColumnNode = {
  lineageId: string; name: string; dataType: string | null;
  componentRefId: string; role: Role;
  derivedFromLineageId: string | null; // null => origin, produced directly by a SOURCE component
  transformType: string; logicText: string;
};

function buildColumnGraph(components: ParsedComponent[], warnings: string[]): Map<string, ColumnNode> {
  const graph = new Map<string, ColumnNode>();
  for (const comp of components) {
    if (comp.role === "DESTINATION") continue; // destinations only consume; walked separately
    if (comp.role === "SCRIPT") {
      for (const oc of comp.outputColumns) {
        graph.set(oc.lineageId, {
          lineageId: oc.lineageId, name: oc.name, dataType: oc.dataType, componentRefId: comp.refId, role: comp.role,
          derivedFromLineageId: null, transformType: "UNKNOWN", logicText: `Script Component "${comp.name}" — not parsed`,
        });
      }
      warnings.push(`Script Component "${comp.name}": logic not parsed, its columns are marked UNKNOWN/LOW confidence.`);
      continue;
    }
    if (comp.role === "SOURCE") {
      for (const oc of comp.outputColumns) {
        graph.set(oc.lineageId, {
          lineageId: oc.lineageId, name: oc.name, dataType: oc.dataType, componentRefId: comp.refId, role: comp.role,
          derivedFromLineageId: null, transformType: "DIRECT", logicText: `Source: ${comp.name}`,
        });
      }
      continue;
    }
    for (const oc of comp.outputColumns) {
      if (oc.sourceLineageId) {
        graph.set(oc.lineageId, {
          lineageId: oc.lineageId, name: oc.name, dataType: oc.dataType, componentRefId: comp.refId, role: comp.role,
          derivedFromLineageId: oc.sourceLineageId, transformType: ROLE_TRANSFORM[comp.role],
          logicText: comp.role === "DATA_CONVERT" ? `Data Conversion -> ${oc.dataType ?? "?"}` : `${comp.name}: ${oc.name}`,
        });
        continue;
      }
      const matchedInput = comp.inputColumns.find((ic) => ic.cachedName.toLowerCase() === oc.name.toLowerCase());
      if (matchedInput) {
        graph.set(oc.lineageId, {
          lineageId: oc.lineageId, name: oc.name, dataType: oc.dataType, componentRefId: comp.refId, role: comp.role,
          derivedFromLineageId: matchedInput.lineageId, transformType: ROLE_TRANSFORM[comp.role],
          logicText: `${comp.name} (${comp.componentClassID})`,
        });
      } else if (comp.role === "LOOKUP") {
        // No matching input column by name => came from the lookup's reference table, not a pass-through.
        graph.set(oc.lineageId, {
          lineageId: oc.lineageId, name: oc.name, dataType: oc.dataType, componentRefId: comp.refId, role: comp.role,
          derivedFromLineageId: comp.inputColumns[0]?.lineageId ?? null, transformType: "LOOKUP",
          logicText: `Lookup "${comp.name}": joined column from reference table`,
        });
      } else if (comp.inputColumns.length === 1 && comp.outputColumns.length === 1) {
        graph.set(oc.lineageId, {
          lineageId: oc.lineageId, name: oc.name, dataType: oc.dataType, componentRefId: comp.refId, role: comp.role,
          derivedFromLineageId: comp.inputColumns[0].lineageId, transformType: ROLE_TRANSFORM[comp.role],
          logicText: `${comp.name} (${comp.componentClassID})`,
        });
      } else {
        graph.set(oc.lineageId, {
          lineageId: oc.lineageId, name: oc.name, dataType: oc.dataType, componentRefId: comp.refId, role: comp.role,
          derivedFromLineageId: null, transformType: "UNKNOWN", logicText: `${comp.name}: unresolved column derivation`,
        });
        warnings.push(`Component "${comp.name}" (${comp.componentClassID}): could not resolve derivation for output column "${oc.name}" — marked UNKNOWN/LOW.`);
      }
    }
  }
  return graph;
}

export type WalkedEdge = {
  destColumnName: string;
  originComponent: ParsedComponent | null;
  originColumnName: string | null;
  transformType: string;
  logicText: string;
  componentChain: string[];
};

function walkChain(destLineageId: string, destColumnName: string, graph: Map<string, ColumnNode>, componentByRefId: Map<string, ParsedComponent>): WalkedEdge {
  const chain: string[] = [];
  let node = graph.get(destLineageId);
  let dominantTransform = "DIRECT";
  const logicParts: string[] = [];
  let hops = 0;
  while (node && hops < 25) {
    hops++;
    const comp = componentByRefId.get(node.componentRefId);
    const compName = comp?.name ?? node.componentRefId;
    if (!chain.includes(compName)) chain.push(compName);
    if (node.transformType !== "DIRECT") { dominantTransform = node.transformType; logicParts.unshift(node.logicText); }
    if (node.derivedFromLineageId == null) {
      return {
        destColumnName, originComponent: comp ?? null, originColumnName: node.name,
        transformType: dominantTransform, logicText: logicParts.length ? logicParts.join(" | ") : `Pass-through: ${chain.join(" -> ")}`,
        componentChain: chain,
      };
    }
    node = graph.get(node.derivedFromLineageId);
  }
  return {
    destColumnName, originComponent: null, originColumnName: null,
    transformType: "UNKNOWN", logicText: "Could not trace the SSIS lineageId chain back to a source column", componentChain: chain,
  };
}

// ── Package-level parse ──────────────────────────────────────────────────────

export type SsisDataFlow = {
  name: string;
  destComponents: { name: string; schema: string | null; table: string; connectionManagerRefId: string | null; edges: WalkedEdge[] }[];
  warnings: string[];
};
export type SsisParseResult = {
  packageName: string;
  definitionHash: string;
  connectionManagers: Record<string, { objectName: string; parsed: ParsedConnStr }>;
  dataFlows: SsisDataFlow[];
};

function findPipelines(node: Xml, acc: { objectName: string; pipeline: Xml }[] = []): { objectName: string; pipeline: Xml }[] {
  for (const exe of asArr(node?.["DTS:Executable"])) {
    if (exe["DTS:CreationName"] === "Microsoft.Pipeline") {
      const pipeline = exe["DTS:ObjectData"]?.pipeline;
      if (pipeline) acc.push({ objectName: exe["DTS:ObjectName"], pipeline });
    }
    if (exe["DTS:Executables"]) findPipelines(exe["DTS:Executables"], acc);
  }
  return acc;
}

export function parseDtsx(xmlText: string): SsisParseResult {
  const root = xmlParser.parse(xmlText);
  const pkg = asArr(root["DTS:Executable"])[0];
  if (!pkg) throw new Error("Not a recognizable .dtsx package (missing root DTS:Executable)");

  const connectionManagers: SsisParseResult["connectionManagers"] = {};
  const engineByConnRefId = new Map<string, string>();
  for (const cm of asArr(pkg["DTS:ConnectionManagers"]?.["DTS:ConnectionManager"])) {
    const connStr = asArr(cm["DTS:ObjectData"]?.["DTS:ConnectionManager"])[0]?.["DTS:ConnectionString"];
    if (!connStr) continue;
    const parsed = parseConnectionString(connStr);
    connectionManagers[cm["DTS:refId"]] = { objectName: cm["DTS:ObjectName"], parsed };
    engineByConnRefId.set(cm["DTS:refId"], parsed.engine);
  }

  const dataFlows: SsisDataFlow[] = [];
  for (const { objectName, pipeline } of findPipelines(pkg["DTS:Executables"])) {
    const warnings: string[] = [];
    const components = parseComponents(pipeline.components, engineByConnRefId, warnings);
    const componentByRefId = new Map(components.map((c) => [c.refId, c]));
    const graph = buildColumnGraph(components, warnings);

    const destComponents: SsisDataFlow["destComponents"] = [];
    for (const dest of components.filter((c) => c.role === "DESTINATION")) {
      const edges = dest.inputColumns.map((ic) => {
        const meta = dest.inputExternalMetadata.find((m) => m.id === ic.externalMetadataColumnId);
        const destColumnName = meta?.name ?? ic.cachedName;
        const walked = walkChain(ic.lineageId, destColumnName, graph, componentByRefId);
        if (!walked.originComponent) warnings.push(`Destination "${dest.name}" column "${destColumnName}": could not trace to a source column — UNKNOWN/LOW.`);
        return walked;
      });
      destComponents.push({ name: dest.name, schema: dest.table?.schema ?? null, table: dest.table?.table ?? dest.name, connectionManagerRefId: dest.connectionManagerRefId, edges });
    }

    dataFlows.push({ name: objectName, destComponents, warnings });
  }

  return { packageName: pkg["DTS:ObjectName"], definitionHash: createHash("sha256").update(xmlText).digest("hex"), connectionManagers, dataFlows };
}

// ── Persistence / orchestration ──────────────────────────────────────────────

const CONFIDENCE_RANK: Record<Confidence, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };
function worseOf(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

async function upsertLineageEdge(opts: {
  scope: "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL"; sourceAssetId: number; targetAssetId: number;
  transformationTypeCode: string; transformationLogicText: string; processId: number;
  confidenceCode: Confidence; connectionId: number;
}) {
  await sql`
    INSERT INTO bayanat.data_lineage
      (lineage_scope_code, asset_type_code, source_asset_id, target_asset_id,
       transformation_type_code, transformation_logic_text, process_id, provenance_code, confidence_code, connection_id, updated_by_user_id)
    VALUES (
      ${opts.scope}, ${opts.scope === "ENTITY_LEVEL" ? "DATA_ENTITIES" : "DATA_ATTRIBUTES"},
      ${opts.sourceAssetId}, ${opts.targetAssetId}, ${opts.transformationTypeCode}, ${opts.transformationLogicText},
      ${opts.processId}, 'SCANNED', ${opts.confidenceCode}, ${opts.connectionId}, 'ssis_scanner'
    )
    ON CONFLICT (lineage_scope_code, source_asset_id, target_asset_id, COALESCE(process_id, -1))
    DO UPDATE SET transformation_type_code = EXCLUDED.transformation_type_code, transformation_logic_text = EXCLUDED.transformation_logic_text,
      confidence_code = EXCLUDED.confidence_code, last_updated_timestamp = now()
  `;
}

export async function ingestSsisPackage(
  xmlText: string,
  fileName: string,
  triggeredByUserId: string,
  ssisConnectionId: number,
): Promise<{ scanRunId: number; warnings: string[]; edgesCreated: number }> {
  const parsed = parseDtsx(xmlText);
  const allWarnings: string[] = [];
  let edgesCreated = 0;

  const [scanRun] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.lineage_scan_runs (connection_id, status_code, triggered_by_user_id)
    VALUES (${ssisConnectionId}, 'RUNNING', ${triggeredByUserId})
    RETURNING scan_run_id AS id
  `;
  const scanRunId = scanRun.id;

  try {
    const [pkgRow] = await sql<{ id: number }[]>`
      SELECT process_id AS id FROM bayanat.lineage_processes
      WHERE connection_id = ${ssisConnectionId} AND process_name = ${fileName} AND process_type_code = 'SSIS_PACKAGE'
    `;
    let packageProcessId: number;
    if (pkgRow) {
      packageProcessId = pkgRow.id;
      await sql`UPDATE bayanat.lineage_processes SET definition_hash = ${parsed.definitionHash}, definition_text = ${parsed.packageName}, last_scanned_timestamp = now() WHERE process_id = ${packageProcessId}`;
    } else {
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO bayanat.lineage_processes (connection_id, process_type_code, process_name, definition_text, definition_hash, last_scanned_timestamp)
        VALUES (${ssisConnectionId}, 'SSIS_PACKAGE', ${fileName}, ${parsed.packageName}, ${parsed.definitionHash}, now())
        RETURNING process_id AS id
      `;
      packageProcessId = row.id;
    }

    // Any SCANNED edge still attached directly to the package-level process is a
    // coarser placeholder pre-dating a proper per-dataflow scan (e.g. a
    // pre-seeded/demo edge, or a leftover from before this package had FR-8.4's
    // parent/child process split) — the dataflow-level edges below supersede it.
    await sql`DELETE FROM bayanat.data_lineage WHERE process_id = ${packageProcessId} AND provenance_code = 'SCANNED'`;

    for (const flow of parsed.dataFlows) {
      allWarnings.push(...flow.warnings.map((w) => `${flow.name}: ${w}`));
      // flow.name is the Data Flow Task's own DTS:ObjectName, which SSIS convention
      // already names with a "DFT " prefix (e.g. "DFT Load Invoices") — don't add another.
      const dataflowProcessName = `${fileName} :: ${flow.name}`;
      const chainDescription = flow.destComponents
        .map((d) => [...new Set(d.edges.flatMap((e) => e.componentChain))].join(" -> "))
        .filter(Boolean)
        .join(" | ") || flow.name;

      const [dfRow] = await sql<{ id: number }[]>`
        SELECT process_id AS id FROM bayanat.lineage_processes
        WHERE connection_id = ${ssisConnectionId} AND process_name = ${dataflowProcessName} AND process_type_code = 'SSIS_DATAFLOW'
      `;
      let dataflowProcessId: number;
      if (dfRow) {
        dataflowProcessId = dfRow.id;
        await sql`UPDATE bayanat.lineage_processes SET definition_hash = ${parsed.definitionHash}, definition_text = ${chainDescription}, last_scanned_timestamp = now() WHERE process_id = ${dataflowProcessId}`;
        await sql`DELETE FROM bayanat.data_lineage WHERE process_id = ${dataflowProcessId} AND provenance_code = 'SCANNED'`;
      } else {
        const [row] = await sql<{ id: number }[]>`
          INSERT INTO bayanat.lineage_processes (connection_id, process_type_code, process_name, parent_process_id, definition_text, definition_hash, last_scanned_timestamp)
          VALUES (${ssisConnectionId}, 'SSIS_DATAFLOW', ${dataflowProcessName}, ${packageProcessId}, ${chainDescription}, ${parsed.definitionHash}, now())
          RETURNING process_id AS id
        `;
        dataflowProcessId = row.id;
      }

      const entityEdgeSeen = new Set<string>();
      for (const dest of flow.destComponents) {
        const destConn = dest.connectionManagerRefId ? parsed.connectionManagers[dest.connectionManagerRefId] : undefined;
        if (!destConn) { allWarnings.push(`Destination "${dest.name}": no resolvable connection manager — skipped.`); continue; }
        const destRef: ExternalRef = { engine: destConn.parsed.engine, host: destConn.parsed.host, database: destConn.parsed.database, schema: dest.schema, object: dest.table };
        const destStitch = await resolveStitch(destRef, scanRunId);
        const destEntityId = destStitch.status === "RESOLVED" ? destStitch.entityId : destStitch.placeholderEntityId;
        const destConfidence: Confidence = destStitch.status === "RESOLVED" ? destStitch.confidence : "LOW";

        for (const edge of dest.edges) {
          if (!edge.originComponent || !edge.originColumnName) continue; // unresolved chain — already warned
          const srcComp = edge.originComponent;
          const srcConn = srcComp.connectionManagerRefId ? parsed.connectionManagers[srcComp.connectionManagerRefId] : undefined;
          if (!srcConn || !srcComp.table) { allWarnings.push(`"${edge.destColumnName}": source component "${srcComp.name}" has no resolvable table/connection — skipped.`); continue; }

          const srcRef: ExternalRef = { engine: srcConn.parsed.engine, host: srcConn.parsed.host, database: srcConn.parsed.database, schema: srcComp.table.schema, object: srcComp.table.table, column: edge.originColumnName };
          const srcStitch = await resolveStitch(srcRef, scanRunId);
          const srcEntityId = srcStitch.status === "RESOLVED" ? srcStitch.entityId : srcStitch.placeholderEntityId;
          const srcConfidence: Confidence = srcStitch.status === "RESOLVED" ? srcStitch.confidence : "LOW";

          const srcAttrId = srcStitch.status === "RESOLVED" && srcStitch.attributeId
            ? srcStitch.attributeId
            : await ensureAttribute(srcEntityId, edge.originColumnName, null);
          const destAttrId = await ensureAttribute(destEntityId, edge.destColumnName, null);

          const edgeConfidence = worseOf(destConfidence, srcConfidence);
          await upsertLineageEdge({
            scope: "ATTRIBUTE_LEVEL", sourceAssetId: srcAttrId, targetAssetId: destAttrId,
            transformationTypeCode: edge.transformType, transformationLogicText: `${edge.logicText} (${edge.componentChain.join(" -> ")})`,
            processId: dataflowProcessId, confidenceCode: edgeConfidence, connectionId: ssisConnectionId,
          });
          edgesCreated++;

          const entityKey = `${srcEntityId}->${destEntityId}`;
          if (!entityEdgeSeen.has(entityKey)) {
            entityEdgeSeen.add(entityKey);
            await upsertLineageEdge({
              scope: "ENTITY_LEVEL", sourceAssetId: srcEntityId, targetAssetId: destEntityId,
              transformationTypeCode: "DIRECT",
              transformationLogicText: `SSIS DFT: ${[srcComp.name, ...edge.componentChain, dest.name].filter((v, i, a) => a.indexOf(v) === i).join(" -> ")}`,
              processId: dataflowProcessId, confidenceCode: edgeConfidence, connectionId: ssisConnectionId,
            });
            edgesCreated++;
          }
        }
      }
    }

    await sql`UPDATE bayanat.lineage_scan_runs SET status_code = 'COMPLETED', finished_at = now(), processes_scanned_count = ${parsed.dataFlows.length}, edges_created_count = ${edgesCreated}, warnings = ${JSON.stringify(allWarnings)}::jsonb WHERE scan_run_id = ${scanRunId}`;
    return { scanRunId, warnings: allWarnings, edgesCreated };
  } catch (err) {
    await sql`UPDATE bayanat.lineage_scan_runs SET status_code = 'FAILED', finished_at = now(), warnings = ${JSON.stringify([...allWarnings, String(err)])}::jsonb WHERE scan_run_id = ${scanRunId}`;
    throw err;
  }
}
