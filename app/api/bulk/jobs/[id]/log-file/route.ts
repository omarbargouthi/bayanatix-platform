import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBulkJob, getBulkJobLogFile } from "@/lib/queries/bulk-jobs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = Number(params.id);
  if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const job = await getBulkJob(jobId);
  if (!job || (session.role !== "ADMIN" && job.createdByUserId !== session.userId)) {
    return NextResponse.json({ error: "Log not available yet (or already purged)" }, { status: 404 });
  }

  const fileData = await getBulkJobLogFile(jobId);
  if (!fileData) return NextResponse.json({ error: "Log not available yet (or already purged)" }, { status: 404 });

  return new NextResponse(fileData as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="bulk-job-${jobId}-log.txt"`,
    },
  });
}
