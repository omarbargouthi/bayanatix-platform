import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { crawlDataSource } from "@/lib/crawler";
import { updateCrawlStatus } from "@/lib/queries/sources";
import { isScheduleDue } from "@/lib/scheduler-utils";

// Hit by a node-cron tick (Authorization: Bearer CRON_SECRET — same convention
// as /api/lineage/pbix/scheduled-scan and /api/reports/cron/snapshot). Covers the
// generic catalog crawler (crawlDataSource — POSTGRES/MYSQL/MSSQL/ORACLE/CSV/
// EXCEL/JSON/REST_API/SOAP_API); PBIX_FOLDER keeps its own separate scheduler
// (lineage-specific ingestion, unrelated schedule mechanism, untouched by this).
// "Due" is computed from crawl_config.schedule_cron against
// connection_registry.last_discovery_timestamp (null = never crawled = due now).
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidates = await sql<{
    connectionId: number; connectionName: string; scheduleCron: string;
    lastDiscoveryTimestamp: string | null; crawlStatus: string;
  }[]>`
    SELECT c.connection_id AS "connectionId", c.connection_name AS "connectionName",
           cc.schedule_cron AS "scheduleCron",
           c.last_discovery_timestamp AS "lastDiscoveryTimestamp",
           c.crawl_status AS "crawlStatus"
    FROM bayanat.connection_registry c
    JOIN bayanat.crawl_config cc ON cc.connection_id = c.connection_id
    WHERE cc.schedule_cron IS NOT NULL
      AND coalesce(c.is_active_boolean, true)
      AND c.db_type_code != 'PBIX_FOLDER'
  `;

  const results = [];
  for (const c of candidates) {
    if (c.crawlStatus === "CRAWLING") {
      results.push({ connectionId: c.connectionId, connectionName: c.connectionName, skipped: "already crawling" });
      continue;
    }
    if (!isScheduleDue(c.scheduleCron, c.lastDiscoveryTimestamp)) {
      results.push({ connectionId: c.connectionId, connectionName: c.connectionName, skipped: "not due" });
      continue;
    }
    try {
      await updateCrawlStatus(c.connectionId, "CRAWLING");
      // Fire-and-forget, mirrors the manual crawl-trigger route — each crawl can
      // run long, the batch response shouldn't wait for all of them to finish.
      void crawlDataSource(c.connectionId).catch(async (err: unknown) => {
        await updateCrawlStatus(c.connectionId, "FAILED", (err as Error).message);
      });
      results.push({ connectionId: c.connectionId, connectionName: c.connectionName, started: true });
    } catch (err) {
      results.push({ connectionId: c.connectionId, connectionName: c.connectionName, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ candidates: candidates.length, results });
}
