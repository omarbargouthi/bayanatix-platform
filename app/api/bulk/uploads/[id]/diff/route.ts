import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseUploadedWorkbook } from "@/lib/bulk/workbook-reader";
import { validateWorkbook, summarizePlans } from "@/lib/bulk/validate";
import { getBulkJob, getBulkJobFile } from "@/lib/queries/bulk-jobs";

// GET .../diff?filter=errors|conflicts — re-parses + re-validates from the stored
// upload on every call, so the preview always reflects current DB state rather than
// a plan cached at upload time.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = Number(params.id);
  if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const job = await getBulkJob(jobId);
  if (!job || job.jobTypeCode !== "UPLOAD") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = await getBulkJobFile(jobId);
  if (!file?.fileData) return NextResponse.json({ error: "Upload file no longer available (purged)" }, { status: 404 });

  const parsed = await parseUploadedWorkbook(file.fileData);
  const exportSnapshotAt = job.exportSnapshotAt ? new Date(job.exportSnapshotAt) : null;
  const plans = await validateWorkbook(parsed, { session, strictMode: job.strictMode, exportSnapshotAt });

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter");
  const filtered = filter === "errors" ? plans.filter((p) => p.outcome === "ERROR")
    : filter === "conflicts" ? plans.filter((p) => p.outcome === "SKIPPED_CONFLICT")
    : plans;

  return NextResponse.json({ jobId, totals: summarizePlans(plans), rows: filtered });
}
