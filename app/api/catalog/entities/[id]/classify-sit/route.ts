import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { runSitClassification, type SitScopeMode } from "@/lib/sit-classification-runner";

// Ad-hoc "Suggest Sensitive Info Types" action on a single table. Only evaluates
// columns already confirmed BUSINESS by the Column Asset-Type classifier — see
// lib/sit-classification-runner.ts's resolveTargetAttributes().
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entityId = Number(params.id);
  if (!Number.isFinite(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const scopeMode = (body.scope_mode as SitScopeMode) ?? "ALL";

  try {
    const summary = await runSitClassification({
      scopeType: "ENTITY", scopeId: entityId, scopeMode, triggeredByUserId: session.userId,
    });
    return NextResponse.json(summary, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
