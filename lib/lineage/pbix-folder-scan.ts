// Scans a db_type_code='PBIX_FOLDER' connection's directory for .pbix files and
// ingests each one via ingestPbixFile — the folder-based, schedulable counterpart
// to the single-file manual upload (app/api/lineage/pbix/upload/route.ts). Skips
// files whose mtime hasn't changed since their last successful scan (unless
// opts.force), so a nightly re-scan of a slowly-refreshed export folder is cheap.
// Reuses the same crawl_jobs/connection_registry status plumbing as lib/crawler.ts's
// crawlDataSource so this shows up in the same admin "crawl history" UI.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { sql } from "../db";
import { getConnection } from "../queries/sources";
import { createCrawlJob, addCrawlJobLog, finishCrawlJob, failCrawlJob } from "../queries/crawl-jobs";
import { updateCrawlStatus } from "../queries/sources";
import { ingestPbixFile } from "./pbix-parser";
import { cleanSourcePath } from "../source-path";
import { ensureDataSource } from "./catalog-upsert";
import { pruneOrphanPlaceholders } from "./stitching";

export type PbixFolderScanResult = { filesScanned: number; filesSkipped: number; edgesCreated: number; warnings: string[] };

/** The .pbix files a connection's path points at: every .pbix in a folder, or the one
 *  file when the path is a .pbix file itself. */
export function listPbixFiles(rawPath: string): { dir: string; files: string[] } {
  const root = cleanSourcePath(rawPath);
  if (!root) throw new Error("Directory path is required");
  if (!existsSync(root)) throw new Error(`Path not found: ${root}`);
  if (statSync(root).isFile()) {
    if (!root.toLowerCase().endsWith(".pbix")) throw new Error(`Not a .pbix file: ${root}`);
    return { dir: path.dirname(root), files: [path.basename(root)] };
  }
  const files = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".pbix"))
    .map((d) => d.name);
  return { dir: root, files };
}

export async function scanPbixFolder(
  connectionId: number,
  triggeredByUserId: string,
  opts: { force?: boolean } = {},
): Promise<PbixFolderScanResult> {
  const conn = await getConnection(connectionId);
  if (!conn) throw new Error("Connection not found");
  if (conn.dbTypeCode !== "PBIX_FOLDER") throw new Error("connectionId must reference a db_type_code='PBIX_FOLDER' connection");

  const jobId = await createCrawlJob(connectionId, conn.connectionName);
  await addCrawlJobLog(jobId, "INFO", `Scanning "${conn.hostAddress}" for .pbix files`);

  let filesScanned = 0, filesSkipped = 0, edgesCreated = 0, tablesTotal = 0, columnsTotal = 0;
  const warnings: string[] = [];

  try {
    const { dir, files } = listPbixFiles(conn.hostAddress);
    // The connection's own source in the catalog, so what was crawled is found under
    // the name the connection was given (each report becomes a schema inside it).
    const dataSourceId = await ensureDataSource(conn.connectionName, "POWERBI", cleanSourcePath(conn.hostAddress), null, { connectionId });
    await addCrawlJobLog(jobId, "INFO", `Found ${files.length} .pbix file(s)`);

    for (const fileName of files) {
      const filePath = path.join(dir, fileName);
      const mtime = statSync(filePath).mtime;

      const [state] = await sql<{ fileMtime: Date }[]>`
        SELECT file_mtime AS "fileMtime" FROM bayanat.lineage_pbix_file_state
        WHERE connection_id = ${connectionId} AND file_name = ${fileName}
      `;
      if (!opts.force && state && state.fileMtime.getTime() >= mtime.getTime()) {
        filesSkipped++;
        continue;
      }

      await addCrawlJobLog(jobId, "INFO", `Ingesting "${fileName}" (modified ${mtime.toISOString()})`);
      try {
        const buf = readFileSync(filePath);
        const result = await ingestPbixFile(buf, fileName, triggeredByUserId, connectionId, { dataSourceId });
        for (const w of result.warnings) await addCrawlJobLog(jobId, "WARN", w);
        await addCrawlJobLog(jobId, "INFO", `  → ${fileName}: ${result.pagesIngested} report page(s), ${result.visualsIngested} visual(s)`);
        edgesCreated += result.edgesCreated;
        tablesTotal += result.tablesIngested;
        columnsTotal += result.columnsIngested;
        for (const w of result.warnings) warnings.push(`${fileName}: ${w}`);

        await sql`
          INSERT INTO bayanat.lineage_pbix_file_state (connection_id, file_name, file_mtime, last_scanned_at)
          VALUES (${connectionId}, ${fileName}, ${mtime.toISOString()}, now())
          ON CONFLICT (connection_id, file_name) DO UPDATE SET file_mtime = EXCLUDED.file_mtime, last_scanned_at = now()
        `;
        filesScanned++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`${fileName}: FAILED — ${msg}`);
        await addCrawlJobLog(jobId, "ERROR", `"${fileName}" failed: ${msg}`);
      }
    }

    await pruneOrphanPlaceholders();
    await addCrawlJobLog(jobId, "INFO", `Cataloged under source "${conn.connectionName}" (Data Catalog), ${tablesTotal} table(s), ${columnsTotal} column(s)`);
    await addCrawlJobLog(jobId, "INFO", `Done: ${filesScanned} scanned, ${filesSkipped} unchanged/skipped, ${edgesCreated} lineage edge(s) created`);
    await finishCrawlJob(jobId, 1, tablesTotal, columnsTotal);
    await updateCrawlStatus(connectionId, "COMPLETED", undefined, { schemas: 1, tables: tablesTotal, columns: columnsTotal });
    return { filesScanned, filesSkipped, edgesCreated, warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failCrawlJob(jobId, msg);
    await updateCrawlStatus(connectionId, "FAILED", msg);
    throw err;
  }
}
