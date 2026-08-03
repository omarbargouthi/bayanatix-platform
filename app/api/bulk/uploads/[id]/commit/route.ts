import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { parseUploadedWorkbook } from "@/lib/bulk/workbook-reader";
import { validateWorkbook, summarizePlans } from "@/lib/bulk/validate";
import { commitPlans } from "@/lib/bulk/commit";
import { buildResultWorkbook } from "@/lib/bulk/result-writer";
import { getBulkJob, getBulkJobFile, finishUploadCommit, failJob } from "@/lib/queries/bulk-jobs";

// Body: { conflict_policy?: "SKIP"|"OVERWRITE", confirmed: true, override_row_keys?: string[] }
// Re-validates fresh from the stored file (never trusts a client-supplied plan) then
// commits exactly what that validation produced.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const jobId = Number(params.id);
  if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (!body.confirmed) return NextResponse.json({ error: "confirmed:true is required to commit" }, { status: 400 });

  const job = await getBulkJob(jobId);
  if (!job || job.jobTypeCode !== "UPLOAD") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status === "COMMITTED") return NextResponse.json({ error: "This upload has already been committed" }, { status: 409 });

  const file = await getBulkJobFile(jobId);
  if (!file?.fileData) return NextResponse.json({ error: "Upload file no longer available (purged)" }, { status: 404 });

  const conflictPolicy = (body.conflict_policy === "OVERWRITE" ? "OVERWRITE" : "SKIP") as "SKIP" | "OVERWRITE";
  const overrideRowKeys = new Set<string>(Array.isArray(body.override_row_keys) ? body.override_row_keys : []);

  try {
    const parsed = await parseUploadedWorkbook(file.fileData);
    const exportSnapshotAt = job.exportSnapshotAt ? new Date(job.exportSnapshotAt) : null;
    const plans = await validateWorkbook(parsed, { session, strictMode: job.strictMode, exportSnapshotAt });

    const totals = await commitPlans(jobId, plans, { session, conflictPolicy, overrideRowKeys });
    const resultFile = await buildResultWorkbook(plans);
    await finishUploadCommit(jobId, { ...summarizePlans(plans), ...totals }, resultFile);

    return NextResponse.json({ jobId, totals });
  } catch (err) {
    await failJob(jobId, err instanceof Error ? err.message : "Commit failed");
    return NextResponse.json({ error: err instanceof Error ? err.message : "Commit failed" }, { status: 500 });
  }
}
