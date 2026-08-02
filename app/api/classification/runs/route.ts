import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { runColumnClassification, type ScopeType, type ScopeMode } from "@/lib/classification-runner";

const SCOPE_TYPES: ScopeType[] = ["DATA_SOURCE", "SCHEMA", "ENTITY", "FULL"];
const SCOPE_MODES: ScopeMode[] = ["NEW_ONLY", "UNCLASSIFIED_ONLY", "ALL"];

// Starts a Column Asset-Type classification run over an explicit scope. Runs
// synchronously and returns the summary — ad-hoc runs are scoped small enough
// (a source/schema/entity, not typically the whole catalog) that this stays fast;
// see lib/classification-runner.ts for the batching that keeps it set-based.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const scopeType = body.scope_type as ScopeType;
  const scopeMode = (body.scope_mode as ScopeMode) ?? "UNCLASSIFIED_ONLY";
  const scopeId = body.scope_id != null ? Number(body.scope_id) : null;

  if (!SCOPE_TYPES.includes(scopeType)) return NextResponse.json({ error: `scope_type must be one of ${SCOPE_TYPES.join(", ")}` }, { status: 400 });
  if (!SCOPE_MODES.includes(scopeMode)) return NextResponse.json({ error: `scope_mode must be one of ${SCOPE_MODES.join(", ")}` }, { status: 400 });
  if (scopeType !== "FULL" && scopeId == null) return NextResponse.json({ error: "scope_id is required unless scope_type is FULL" }, { status: 400 });

  try {
    const summary = await runColumnClassification({
      scopeType, scopeId, scopeMode, triggeredByUserId: session.userId,
    });
    return NextResponse.json(summary, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
