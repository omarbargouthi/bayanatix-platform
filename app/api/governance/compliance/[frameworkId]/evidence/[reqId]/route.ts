import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { attachEvidence, getEvidenceData } from "@/lib/queries/gov-compliance";

export async function POST(req: Request, { params }: { params: { reqId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  await attachEvidence(Number(params.reqId), file.name, buffer);
  return NextResponse.json({ ok: true, fileName: file.name });
}

export async function GET(_req: Request, { params }: { params: { reqId: string } }) {
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
