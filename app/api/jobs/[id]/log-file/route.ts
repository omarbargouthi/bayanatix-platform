import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getJob, getJobLogFile } from "@/lib/queries/background-jobs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = Number(params.id);
  if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const job = await getJob(jobId);
  if (!job || (session.role !== "ADMIN" && job.createdByUserId !== session.userId)) {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  const logData = await getJobLogFile(jobId);
  if (!logData) return NextResponse.json({ error: "Log not available" }, { status: 404 });

  return new NextResponse(logData as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="job-${jobId}-log.txt"`,
    },
  });
}
