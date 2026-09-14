import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { parseUploadedWorkbook } from "@/lib/bulk/workbook-reader";
import { validateWorkbook, summarizePlans } from "@/lib/bulk/validate";
import { commitPlans } from "@/lib/bulk/commit";
import { buildResultWorkbook, buildRejectedWorkbook } from "@/lib/bulk/result-writer";
import { buildJobLogText } from "@/lib/bulk/log-writer";
import { createUploadJob, finishUploadCommit, failJob, getBulkJob } from "@/lib/queries/bulk-jobs";
import { TEMPLATE_SCHEMA_VERSION } from "@/lib/bulk/sheets";

// multipart/form-data: file, strict_mode?, conflict_policy?
// Reads and sanity-checks the workbook synchronously (fast — just structure, no
// per-row DB work) so a wrong/corrupt file fails immediately with a clear error.
// Everything else — row-by-row validation, the actual commit, and building the
// result/rejected/log files — runs in the background (see lib/queries/bulk-jobs.ts's
// top note): there is no manual review/approve step, the upload commits
// automatically. Poll GET /api/bulk/jobs/{id} (progressProcessed/progressTotal show
// live progress) or watch the Jobs tab; once COMMITTED, download the result,
// rejected-records, and log files from there.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const strictMode = formData.get("strict_mode") === "true";
  const conflictPolicy = (formData.get("conflict_policy") === "OVERWRITE" ? "OVERWRITE" : "SKIP") as "SKIP" | "OVERWRITE";
  const fileData = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseUploadedWorkbook(fileData);
  } catch (err) {
    return NextResponse.json({ error: `Could not read workbook: ${err instanceof Error ? err.message : "invalid file"}` }, { status: 400 });
  }

  if (parsed.schemaVersionMismatch) {
    return NextResponse.json({
      error: `This template is from an older schema version (expected ${TEMPLATE_SCHEMA_VERSION}, found ${parsed.meta?.schemaVersion ?? "unknown"}) — re-download the template and re-apply your edits.`,
    }, { status: 400 });
  }
  if (Object.keys(parsed.sheets).length === 0) {
    return NextResponse.json({ error: "No recognizable sheets/columns found — is this a Bayanatix export file?" }, { status: 400 });
  }

  const exportSnapshotAt = parsed.meta?.exportedAt ? new Date(parsed.meta.exportedAt) : null;
  const jobId = await createUploadJob(file.name, fileData, session.userId, { strictMode, conflictPolicy, exportSnapshotAt });

  void (async () => {
    try {
      const plans = await validateWorkbook(parsed, { session, strictMode, exportSnapshotAt });
      const commitTotals = await commitPlans(jobId, plans, { session, conflictPolicy, overrideRowKeys: new Set() });
      const resultFile = await buildResultWorkbook(plans);
      const rejectedFile = await buildRejectedWorkbook(parsed, plans);
      const totals = { ...summarizePlans(plans), ...commitTotals };

      const job = await getBulkJob(jobId);
      const logFile = buildJobLogText({ ...job!, status: "COMMITTED", totals, finishedAt: new Date().toISOString() });
      await finishUploadCommit(jobId, totals, resultFile, logFile, rejectedFile);
    } catch (err) {
      await failJob(jobId, err instanceof Error ? err.message : "Upload processing failed");
    }
  })();

  return NextResponse.json({ jobId, status: "RUNNING" }, { status: 202 });
}
