import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { parseUploadedWorkbook } from "@/lib/bulk/workbook-reader";
import { validateWorkbook, summarizePlans } from "@/lib/bulk/validate";
import { createUploadJob, failJob } from "@/lib/queries/bulk-jobs";
import { TEMPLATE_SCHEMA_VERSION } from "@/lib/bulk/sheets";

// multipart/form-data: file, strict_mode?, conflict_policy? -> parse+validate -> AWAITING_CONFIRM job + diff summary
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

  try {
    const plans = await validateWorkbook(parsed, { session, strictMode, exportSnapshotAt });
    const totals = summarizePlans(plans);
    return NextResponse.json({ jobId, totals }, { status: 201 });
  } catch (err) {
    await failJob(jobId, err instanceof Error ? err.message : "Validation failed");
    return NextResponse.json({ error: err instanceof Error ? err.message : "Validation failed" }, { status: 500 });
  }
}
