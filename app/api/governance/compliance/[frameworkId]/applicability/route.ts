import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import { updateFrameworkApplicability } from "@/lib/queries/gov-compliance";

export async function PATCH(req: Request, { params }: { params: { frameworkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const frameworkId = Number(params.frameworkId);
  if (!Number.isFinite(frameworkId)) return NextResponse.json({ error: "Invalid frameworkId" }, { status: 400 });

  const { isApplicable } = (await req.json().catch(() => ({}))) as { isApplicable?: boolean };
  if (typeof isApplicable !== "boolean") return NextResponse.json({ error: "isApplicable must be a boolean" }, { status: 400 });

  await updateFrameworkApplicability(frameworkId, isApplicable, session.userId);
  return NextResponse.json({ ok: true });
}
