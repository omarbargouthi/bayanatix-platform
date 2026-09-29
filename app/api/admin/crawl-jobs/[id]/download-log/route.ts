import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCrawlJob, getCrawlJobLogs } from "@/lib/queries/crawl-jobs";

type Params = { params: { id: string } };

// Crawl logs live as rows in bayanat.crawl_job_logs (unlike bulk_jobs, which
// pre-builds and stores a log file blob) — this builds the plain-text file
// on the fly from those rows rather than needing a schema change.
export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const jobId = Number(params.id);
  if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const job = await getCrawlJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const logs = await getCrawlJobLogs(jobId);
  const text = logs.map((l) => `${l.loggedAt} [${l.level}] ${l.message}`).join("\n") + "\n";

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="crawl-job-${jobId}-${job.connectionName.replace(/[^a-z0-9]+/gi, "-")}.log"`,
    },
  });
}
