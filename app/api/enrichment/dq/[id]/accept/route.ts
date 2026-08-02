import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { acceptDqRuleSuggestion } from "@/lib/queries/enrichment-dq";

// {overrides?} -> creates a dq_rules row (edited values win); links created_rule_id (spec §4/AC7).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const suggestionId = Number(params.id);
  if (!Number.isFinite(suggestionId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  try {
    const ruleId = await acceptDqRuleSuggestion(suggestionId, session.userId, body.overrides);
    return NextResponse.json({ ok: true, ruleId });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
