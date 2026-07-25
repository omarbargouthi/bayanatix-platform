import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDownstreamImpact, getUpstreamImpact, type LineageAssetType } from "@/lib/queries/lineage";

const ASSET_TYPES = new Set(["DATA_ENTITIES", "DATA_ATTRIBUTES"]);

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assetType = searchParams.get("assetType");
  const assetId   = Number(searchParams.get("assetId"));
  const direction = searchParams.get("direction");
  const maxDepth  = Math.min(10, Math.max(1, Number(searchParams.get("maxDepth") ?? "10")));

  if (!assetType || !ASSET_TYPES.has(assetType)) {
    return NextResponse.json({ error: "assetType must be DATA_ENTITIES or DATA_ATTRIBUTES" }, { status: 400 });
  }
  if (!Number.isFinite(assetId)) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }
  if (direction !== "UP" && direction !== "DOWN") {
    return NextResponse.json({ error: "direction must be UP or DOWN" }, { status: 400 });
  }

  const report = direction === "DOWN"
    ? await getDownstreamImpact(assetType as LineageAssetType, assetId, maxDepth)
    : await getUpstreamImpact(assetType as LineageAssetType, assetId, maxDepth);

  return NextResponse.json(report);
}
