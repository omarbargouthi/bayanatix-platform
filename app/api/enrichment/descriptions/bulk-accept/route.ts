import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { bulkAcceptDescriptions } from "@/lib/queries/enrichment-descriptions";

// Bulk-accept for checked rows in the review queue (spec §2.4). Drifted rows
// (official description changed since the suggestion was made) are skipped and
// returned separately so the UI can prompt for individual review.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const suggestionIds: number[] = Array.isArray(body.suggestion_ids) ? body.suggestion_ids.map(Number).filter(Number.isFinite) : [];
  if (suggestionIds.length === 0) return NextResponse.json({ error: "suggestion_ids must be a non-empty array" }, { status: 400 });

  const result = await bulkAcceptDescriptions(suggestionIds, session.userId);
  return NextResponse.json({ ok: true, accepted: result.accepted.length, skippedDrift: result.skippedDrift });
}
