import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getJob, getJobResultFile } from "@/lib/queries/background-jobs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = Number(params.id);
  if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const job = await getJob(jobId);
  if (!job || (session.role !== "ADMIN" && job.createdByUserId !== session.userId)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const fileData = await getJobResultFile(jobId);
  if (!fileData) return NextResponse.json({ error: "File not available" }, { status: 404 });

  return new NextResponse(fileData as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": job.resultFileMimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${job.resultFileName ?? `job-${jobId}`}"`,
    },
  });
}
