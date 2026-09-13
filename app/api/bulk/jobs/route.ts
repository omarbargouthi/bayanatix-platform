import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listBulkJobs } from "@/lib/queries/bulk-jobs";

// Feeds the Jobs tab on the Bulk Operations page — the current user's own
// download/upload jobs, newest first, with running ones surfaced for polling.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await listBulkJobs(session.userId);
  return NextResponse.json({ data: jobs });
}
