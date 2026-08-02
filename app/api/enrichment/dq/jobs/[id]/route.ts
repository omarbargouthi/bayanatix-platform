import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEnrichmentJob, getEnrichmentJobLogs } from "@/lib/queries/enrichment-jobs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = Number(params.id);
  if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const job = await getEnrichmentJob(jobId);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const logs = await getEnrichmentJobLogs(jobId);
  return NextResponse.json({ ...job, logs });
}
