import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBulkJob, getBulkJobFile } from "@/lib/queries/bulk-jobs";

// Downloads are scoped to the job's own creator (or an ADMIN) — bulk job ids are
// sequential and these exports can carry extended/custom attributes and PI clear-text,
// so a bare session check isn't enough (see app/api/bulk/jobs/route.ts, which already
// scopes the job *list* the same way via listBulkJobs(session.userId)).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = Number(params.id);
  if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const job = await getBulkJob(jobId);
  if (!job || (session.role !== "ADMIN" && job.createdByUserId !== session.userId)) {
    return NextResponse.json({ error: "File not found or already purged" }, { status: 404 });
  }

  const file = await getBulkJobFile(jobId);
  if (!file?.fileData) return NextResponse.json({ error: "File not found or already purged" }, { status: 404 });

  return new NextResponse(file.fileData as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file.fileName ?? `export-${jobId}.xlsx`}"`,
    },
  });
}
