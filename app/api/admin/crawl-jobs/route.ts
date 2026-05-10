import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listCrawlJobs } from "@/lib/queries/crawl-jobs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const connectionIdParam = searchParams.get("connectionId");

  const jobs = await listCrawlJobs(
    connectionIdParam ? Number(connectionIdParam) : undefined,
  );

  return NextResponse.json(jobs);
}
