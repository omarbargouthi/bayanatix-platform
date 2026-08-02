import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { parseAssetType } from "@/lib/enrichment/context";
import { suggestDqRulesForColumn, suggestDqRulesForTable } from "@/lib/enrichment/dq-job";

// DQ suggestions for one asset (spec §3.1 / §4), used by the "Suggest Rules" panel
// inside the DQ rule builder. Requires fresh profiling for full-confidence Tier 1
// results (spec §3.3 AC5) — degraded (structure-only) suggestions are still
// returned, just flagged, rather than blocking the steward.
export async function POST(_req: Request, { params }: { params: { assetType: string; assetId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assetType = parseAssetType(params.assetType);
  if (!assetType) return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
  const assetId = Number(params.assetId);
  if (!Number.isFinite(assetId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  if (assetType === "DATA_ATTRIBUTES") {
    const result = await suggestDqRulesForColumn(assetId);
    if (!result) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    return NextResponse.json(result, { status: 201 });
  }
  const created = await suggestDqRulesForTable(assetId);
  return NextResponse.json({ created }, { status: 201 });
}
