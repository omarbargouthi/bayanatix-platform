import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { runDqSuggestionJob } from "@/lib/enrichment/dq-job";
import { parseAssetType } from "@/lib/enrichment/context";

// Bulk DQ rule suggestion (spec §3.1 "also available as a bulk action from the
// columns grid" / §4). Body: { asset_type: "DATA_ENTITIES"|"DATA_ATTRIBUTES", asset_ids: number[] }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const assetType = parseAssetType(String(body.asset_type ?? ""));
  if (!assetType) return NextResponse.json({ error: "asset_type must be DATA_ENTITIES or DATA_ATTRIBUTES" }, { status: 400 });

  const assetIds: number[] = Array.isArray(body.asset_ids) ? body.asset_ids.map(Number).filter(Number.isFinite) : [];
  if (assetIds.length === 0) return NextResponse.json({ error: "asset_ids must be a non-empty array" }, { status: 400 });

  const jobId = await runDqSuggestionJob({ assetType, assetIds }, session.userId);
  return NextResponse.json({ jobId }, { status: 202 });
}
