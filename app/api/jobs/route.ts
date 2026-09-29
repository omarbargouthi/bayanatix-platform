import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listJobs, getJob } from "@/lib/queries/background-jobs";

// Feeds any page's <BackgroundJobsPanel jobTypeCodes={[...]} /> (Reports,
// Governance Compliance, Translations) — the current user's own jobs of the
// requested type(s), newest first, with running ones surfaced for polling.
// ?jobId=N returns just that one job (used by the poller once a job starts).
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  if (jobId) {
    const job = await getJob(Number(jobId));
    if (!job || (session.role !== "ADMIN" && job.createdByUserId !== session.userId)) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  }

  const types = (searchParams.get("types") ?? "").split(",").filter(Boolean);
  if (types.length === 0) return NextResponse.json({ error: "types is required" }, { status: 400 });

  const jobs = await listJobs(types, session.userId, session.role === "ADMIN");
  return NextResponse.json({ data: jobs });
}
