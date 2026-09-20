import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { runSitClassification, type SitScopeType, type SitScopeMode } from "@/lib/sit-classification-runner";

const SCOPE_TYPES: SitScopeType[] = ["DATA_SOURCE", "SCHEMA", "ENTITY", "FULL"];
const SCOPE_MODES: SitScopeMode[] = ["NEW_ONLY", "ALL"];

// Starts a SIT classification run over an explicit scope (admin-triggered, sibling
// to /api/classification/runs). Runs synchronously — same rationale as that route:
// ad-hoc scopes stay small enough for this to be fast.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const scopeType = body.scope_type as SitScopeType;
  const scopeMode = (body.scope_mode as SitScopeMode) ?? "ALL";
  const scopeId = body.scope_id != null ? Number(body.scope_id) : null;

  if (!SCOPE_TYPES.includes(scopeType)) return NextResponse.json({ error: `scope_type must be one of ${SCOPE_TYPES.join(", ")}` }, { status: 400 });
  if (!SCOPE_MODES.includes(scopeMode)) return NextResponse.json({ error: `scope_mode must be one of ${SCOPE_MODES.join(", ")}` }, { status: 400 });
  if (scopeType !== "FULL" && scopeId == null) return NextResponse.json({ error: "scope_id is required unless scope_type is FULL" }, { status: 400 });

  try {
    const summary = await runSitClassification({ scopeType, scopeId, scopeMode, triggeredByUserId: session.userId });
    return NextResponse.json(summary, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
