import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConnection, updateCrawlStatus } from "@/lib/queries/sources";
import { crawlDataSource } from "@/lib/crawler";
import { scanPbixFolder } from "@/lib/lineage/pbix-folder-scan";

type Params = { params: { id: string } };

export async function POST(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connectionId = Number(params.id);
  const conn = await getConnection(connectionId);
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conn.crawlStatus === "CRAWLING") return NextResponse.json({ error: "Crawl already in progress" }, { status: 409 });

  await updateCrawlStatus(connectionId, "CRAWLING");

  // Fire-and-forget — runs in Node.js background. PBIX_FOLDER has its own
  // scanner (lineage-specific ingestion, not the generic catalog crawler) but
  // reuses the exact same status/job-log plumbing so the UI needs no changes.
  const task = conn.dbTypeCode === "PBIX_FOLDER"
    ? scanPbixFolder(connectionId, session.userId, { force: true })
    : crawlDataSource(connectionId);
  void task.catch(async (err: unknown) => {
    await updateCrawlStatus(connectionId, "FAILED", (err as Error).message);
  });

  return NextResponse.json({ ok: true, status: "CRAWLING" }, { status: 202 });
}
