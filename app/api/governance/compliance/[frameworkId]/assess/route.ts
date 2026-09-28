import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import { upsertAssessment } from "@/lib/queries/gov-compliance";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  await upsertAssessment(body.reqId, {
    submissionStatus:     body.submissionStatus,
    evidentAdminOverride: body.evidentAdminOverride ?? null,
    domainOwnerOverride:  body.domainOwnerOverride  ?? null,
    supportingEvidenceOverride: body.supportingEvidenceOverride ?? null,
    managementNotes:      body.managementNotes      ?? null,
    comments:             body.comments             ?? null,
    assessedBy:           session.userId,
  });
  return NextResponse.json({ ok: true });
}
