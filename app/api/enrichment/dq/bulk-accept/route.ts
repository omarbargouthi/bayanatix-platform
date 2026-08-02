import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { bulkAcceptDqSuggestions } from "@/lib/queries/enrichment-dq";

// DUPLICATE-status rows are excluded (spec §3.3 AC6: not accepted-able by bulk).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const suggestionIds: number[] = Array.isArray(body.suggestion_ids) ? body.suggestion_ids.map(Number).filter(Number.isFinite) : [];
  if (suggestionIds.length === 0) return NextResponse.json({ error: "suggestion_ids must be a non-empty array" }, { status: 400 });

  const result = await bulkAcceptDqSuggestions(suggestionIds, session.userId);
  return NextResponse.json({ ok: true, accepted: result.accepted.length, skippedDuplicate: result.skippedDuplicate });
}
