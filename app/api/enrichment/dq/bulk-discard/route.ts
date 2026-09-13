import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { bulkDiscardDqSuggestions } from "@/lib/queries/enrichment-dq";

// Bulk-reject for checked rows in the review queue — the discard counterpart
// to bulk-accept.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const suggestionIds: number[] = Array.isArray(body.suggestion_ids) ? body.suggestion_ids.map(Number).filter(Number.isFinite) : [];
  if (suggestionIds.length === 0) return NextResponse.json({ error: "suggestion_ids must be a non-empty array" }, { status: 400 });

  const discarded = await bulkDiscardDqSuggestions(suggestionIds, session.userId);
  return NextResponse.json({ ok: true, discarded: discarded.length });
}
