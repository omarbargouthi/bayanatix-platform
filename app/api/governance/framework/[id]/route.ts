import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain, canManageDomain } from "@/lib/can";
import { getGovDoc, updateGovDoc, deleteGovDoc, listAttachments, RegulationInUseError } from "@/lib/queries/gov-framework";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const doc = await getGovDoc(Number(params.id));
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const attachments = await listAttachments(doc.docId);
  return NextResponse.json({ doc, attachments });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  await updateGovDoc(Number(params.id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await deleteGovDoc(Number(params.id));
  } catch (e) {
    if (e instanceof RegulationInUseError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
