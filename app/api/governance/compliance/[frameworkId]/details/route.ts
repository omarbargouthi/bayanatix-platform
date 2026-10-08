import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import { updateRegulationDetails, RegulationUpdateError } from "@/lib/queries/gov-compliance";
import { parseRegulationInput } from "@/lib/regulation-input";

// Edits a regulation's registration: name, version, description, assessment mode, region,
// countries in scope, regulatory body, effective date and official links. Only the fields
// sent are changed. Same permission as marking a regulation applicable.
export async function PATCH(req: Request, { params }: { params: { frameworkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Only people who manage the Governance domain can edit regulation details." }, { status: 403 });

  const frameworkId = Number(params.frameworkId);
  if (!Number.isFinite(frameworkId)) return NextResponse.json({ error: "Invalid frameworkId" }, { status: 400 });

  const parsed = parseRegulationInput((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const found = await updateRegulationDetails(frameworkId, parsed.patch, session.userId);
    if (!found) return NextResponse.json({ error: "Regulation not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof RegulationUpdateError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
