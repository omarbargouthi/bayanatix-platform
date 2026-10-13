import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import { setSectionHidden } from "@/lib/queries/gov-framework";
import { isFwSection } from "@/lib/gov-framework-sections";

// Hide or show a section of the Governance Framework.
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.sectionCode !== "string" || !isFwSection(body.sectionCode) || typeof body.hidden !== "boolean") {
    return NextResponse.json({ error: "A section and whether it is hidden are required." }, { status: 400 });
  }
  await setSectionHidden(body.sectionCode, body.hidden, session.userId);
  return NextResponse.json({ ok: true });
}
