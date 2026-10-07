// Reads one early row of a crawled CSV file. A Power BI query often takes its column
// names from a row other than the first ("Removed Top Rows" then "Promoted Headers"),
// while the catalog names the file's columns after its first row — so the two only line
// up by position. This returns the row the report promoted, in file order.
import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";
import path from "node:path";
import { sql } from "../db";
import { cleanSourcePath } from "../source-path";

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** The values of row `rowIndex` (0-based, counting every line of the file) of the CSV
 *  file behind a crawled entity, or null when the file can't be located or read. */
export async function csvRowOfEntity(entityId: number, rowIndex: number): Promise<string[] | null> {
  const [row] = await sql<{ entityName: string; host: string | null }[]>`
    SELECT e.entity_name_text AS "entityName", ds.host_address_text AS host
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE e.entity_id = ${entityId} AND ds.source_type_code = 'CSV' AND ds.connection_id IS NOT NULL
  `;
  if (!row?.host) return null;
  try {
    const root = cleanSourcePath(row.host);
    if (!existsSync(root)) return null;
    const filePath = statSync(root).isFile() ? root : path.join(root, `${row.entityName}.csv`);
    if (!existsSync(filePath)) return null;

    // Header rows sit at the very top — a bounded read keeps this cheap on large exports.
    const buf = Buffer.alloc(256 * 1024);
    const fd = openSync(filePath, "r");
    let read = 0;
    try { read = readSync(fd, buf, 0, buf.length, 0); } finally { closeSync(fd); }
    const lines = buf.subarray(0, read).toString("utf8").replace(/^﻿/, "").split(/\r\n|\n|\r/);
    if (rowIndex >= lines.length - 1) return null; // the last line may be cut off by the bounded read
    const sep = lines[0].match(/^sep=(.)\s*$/i);
    return splitCsvLine(lines[rowIndex], sep ? sep[1] : ",");
  } catch {
    return null;
  }
}
