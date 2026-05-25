import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { attachEvidence, getEvidenceData } from "@/lib/queries/gov-compliance";
import { sql } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: { frameworkId: string; reqId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const reqId = Number(params.reqId);
  const fwId  = Number(params.frameworkId);

  // Get old file name for history
  const old = await getEvidenceData(reqId);

  const buffer = Buffer.from(await file.arrayBuffer());
  await attachEvidence(reqId, file.name, buffer);

  // Log history
  if (old?.evidenceName !== file.name) {
    await sql`
      INSERT INTO bayanat.gov_compliance_history
        (req_id, framework_id, field_name, old_value, new_value, changed_by)
      VALUES (${reqId}, ${fwId}, 'evidenceFile', ${old?.evidenceName ?? null}, ${file.name}, ${session.userId})
    `;
  }

  return NextResponse.json({ ok: true, fileName: file.name });
}

export async function GET(
  _req: Request,
  { params }: { params: { frameworkId: string; reqId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getEvidenceData(Number(params.reqId));
  if (!row || !row.evidenceData) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(row.evidenceData, {
    headers: {
      "Content-Type":        "application/octet-stream",
      "Content-Disposition": `attachment; filename="${row.evidenceName}"`,
    },
  });
}
