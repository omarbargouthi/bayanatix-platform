import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createJob } from "@/lib/queries/background-jobs";
import { runLineageImport, LINEAGE_IMPORT_JOB_TYPE } from "@/lib/lineage/excel";

// POST — upload a lineage Excel file; runs as a background job (progress, log,
// rejected-rows file) and notifies the uploader when done. Steward/admin only.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "Upload an .xlsx file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const jobId = await createJob(LINEAGE_IMPORT_JOB_TYPE, { fileName: file.name }, session.userId);
  void runLineageImport(jobId, session.userId, file.name, buffer);

  return NextResponse.json({ jobId }, { status: 202 });
}
