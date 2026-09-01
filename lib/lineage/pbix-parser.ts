// FR-9 extension — .pbix upload mode. A .pbix is an OPC zip whose "DataMashup"
// part is a binary stream (MS-QDEFF) wrapping a second, inner zip that holds the
// actual Power Query (M) source under Formulas/Section1.m. That's the only part
// of a .pbix this module can read: table/column DAX measures live in the
// compiled VertiPaq data model, a proprietary binary format with no practical
// JS parser (real tools like pbi-tools lean on .NET Analysis Services libraries
// for that). So this connector gets table-level (and best-effort column-level)
// lineage from the M definitions, not measure-level DAX lineage.
import { unzipSync } from "fflate";
import { ingestPowerBiScanResult, type ScanResult, type SrTable } from "./powerbi-ingester";

// ── DataMashup binary stream (MS-QDEFF) ──────────────────────────────────────
// Layout: uint32le version, then four length-prefixed byte sections in order:
// packageParts (itself a zip containing Formulas/Section1.m), permissions,
// metadata, permissionBindings. Only packageParts is needed here.

function readPackageParts(pbixBytes: Uint8Array): Uint8Array {
  const outer = unzipSync(pbixBytes);
  const dmKey = Object.keys(outer).find((k) => k.replace(/^\/+/, "").toLowerCase() === "datamashup");
  if (!dmKey) {
    throw new Error(
      'No "DataMashup" part found in this .pbix — it likely uses a live connection or DirectQuery with no local Power Query model to parse.',
    );
  }
  const dm = outer[dmKey];
  if (dm.length < 8) throw new Error("DataMashup part is too small to be valid.");
  const view = new DataView(dm.buffer, dm.byteOffset, dm.byteLength);
  const packagePartsLength = view.getUint32(4, true);
  if (8 + packagePartsLength > dm.length) throw new Error("DataMashup part is truncated or malformed.");
  return dm.subarray(8, 8 + packagePartsLength);
}

function readSection1M(packageParts: Uint8Array): string {
  const inner = unzipSync(packageParts);
  const keys = Object.keys(inner);
  const key = keys.find((k) => /formulas\/section1\.m$/i.test(k)) ?? keys.find((k) => /formulas\/.*\.m$/i.test(k));
  if (!key) throw new Error("No Formulas/Section1.m found inside the DataMashup package.");
  const text = new TextDecoder("utf-8").decode(inner[key]);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ── M section document → top-level `shared` query statements ────────────────
// Depth/string/comment-aware split on ";" at nesting depth 0 (M allows string
// literals and nested (){}[] to contain literal semicolons/braces).

function splitTopLevelStatements(text: string): string[] {
  const statements: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      i++;
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") { depth++; i++; continue; }
    if (ch === ")" || ch === "}" || ch === "]") { depth--; i++; continue; }
    if (ch === ";" && depth === 0) {
      statements.push(text.slice(start, i));
      i++;
      start = i;
      continue;
    }
    i++;
  }
  const tail = text.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

const SHARED_RE = /^\s*shared\s+(?:#"((?:[^"]|"")*)"|([A-Za-z_][\w.]*))\s*=\s*([\s\S]+)$/;

export type PbixQuery = { name: string; expression: string };

export function parseSection1M(source: string): { queries: PbixQuery[]; warnings: string[] } {
  const warnings: string[] = [];
  const queries: PbixQuery[] = [];
  for (const stmt of splitTopLevelStatements(source)) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.startsWith("section ")) continue;
    const m = trimmed.match(SHARED_RE);
    if (!m) continue;
    const name = (m[1] ?? m[2] ?? "").replace(/""/g, '"');
    const expression = m[3].trim();
    if (!name || !expression) continue;
    if (/meta\s*\[[^\]]*IsParameterQuery\s*=\s*true/i.test(expression)) continue; // Power Query parameter, not a data table
    queries.push({ name, expression });
  }
  if (queries.length === 0) warnings.push("No shared (loaded) Power Query tables found in Section1.m — nothing to ingest.");
  return { queries, warnings };
}

// Best-effort column-name extraction from common M shaping steps. Real column
// lists live in the compiled model (unreadable here), so this only recovers
// names the M code happens to spell out explicitly — never a full inventory.
export function extractLikelyColumnNames(expr: string): string[] {
  const names = new Set<string>();
  for (const m of expr.matchAll(/Table\.SelectColumns\s*\([^,]+,\s*\{([^}]*)\}/g)) {
    for (const c of m[1].matchAll(/"((?:[^"]|"")+)"/g)) names.add(c[1].replace(/""/g, '"'));
  }
  for (const m of expr.matchAll(/Table\.TransformColumnTypes\s*\([^,]+,\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
    for (const c of m[1].matchAll(/\{\s*"((?:[^"]|"")+)"/g)) names.add(c[1].replace(/""/g, '"'));
  }
  // Table.RenameColumns({{"Old","New"}, ...}) — capture rename targets so the
  // existing renameMap-inversion logic in the JSON ingester can still match them.
  for (const m of expr.matchAll(/\{"([^"]+)"\s*,\s*"([^"]+)"\}/g)) names.add(m[2]);
  return [...names];
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function ingestPbixFile(
  pbixBuf: Buffer,
  fileName: string,
  triggeredByUserId: string,
  connectionId: number,
): Promise<{ scanRunId: number; edgesCreated: number; warnings: string[] }> {
  const packageParts = readPackageParts(new Uint8Array(pbixBuf));
  const section1 = readSection1M(packageParts);
  const { queries, warnings: parseWarnings } = parseSection1M(section1);

  const datasetName = fileName.replace(/\.pbix$/i, "");
  const tables: SrTable[] = queries.map((q) => ({
    name: q.name,
    columns: extractLikelyColumnNames(q.expression).map((name) => ({ name })),
    source: [{ expression: q.expression }],
  }));

  const scanResult: ScanResult = {
    workspaces: [
      {
        id: `pbix-desktop:${fileName}`,
        name: "Power BI Desktop Uploads",
        datasets: [{ id: `pbix:${fileName}`, name: datasetName, tables }],
      },
    ],
  };

  const result = await ingestPowerBiScanResult(scanResult, connectionId, triggeredByUserId);
  return {
    scanRunId: result.scanRunId,
    edgesCreated: result.edgesCreated,
    warnings: [
      ...parseWarnings,
      "Parsed from the .pbix's Power Query (M) definitions only — DAX measures and the compiled data model aren't readable from a .pbix file, so measure-level lineage isn't available from this upload path.",
      ...result.warnings,
    ],
  };
}
