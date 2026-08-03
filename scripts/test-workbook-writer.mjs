import { resolveDownloadScope } from "../lib/bulk/scope-resolver.ts";
import { buildDownloadWorkbooks } from "../lib/bulk/workbook-writer.ts";
import fs from "fs";

const scope = { type: "DATA_SOURCE", dataSourceId: 5, includeTables: true, includeColumns: true };
const rows = await resolveDownloadScope(scope);
console.log("Sheet row counts:", Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length])));

const buffers = await buildDownloadWorkbooks(rows, {
  exportId: "test-export-1", scopeDescription: "DATA_SOURCE 5 + tables + columns",
  exportedByUserId: "sara.alqahtani", exportedAt: new Date(),
});
console.log("Buffers:", buffers.length, buffers.map((b) => b.length));
const outPath = "C:\\Users\\User\\AppData\\Local\\Temp\\claude\\C--Users-User\\d9af2651-a14b-46b0-92cf-07c2878ad975\\scratchpad\\test-download.xlsx";
fs.writeFileSync(outPath, buffers[0]);
console.log("Wrote", outPath);
process.exit(0);
