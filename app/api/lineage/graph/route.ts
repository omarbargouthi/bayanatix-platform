import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getLineageGraph, type LineageAssetType, type LineageScopeCode } from "@/lib/queries/lineage";

const ASSET_TYPES = new Set(["DATA_ENTITIES", "DATA_ATTRIBUTES"]);
const SCOPES = new Set(["ENTITY_LEVEL", "ATTRIBUTE_LEVEL"]);

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assetType = searchParams.get("assetType");
  const assetId   = Number(searchParams.get("assetId"));
  const scope     = searchParams.get("scope") ?? "ENTITY_LEVEL";
  const up        = Math.min(5, Math.max(1, Number(searchParams.get("up") ?? "2")));
  const down      = Math.min(5, Math.max(1, Number(searchParams.get("down") ?? "2")));

  if (!assetType || !ASSET_TYPES.has(assetType)) {
    return NextResponse.json({ error: "assetType must be DATA_ENTITIES or DATA_ATTRIBUTES" }, { status: 400 });
  }
  if (!Number.isFinite(assetId)) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }
  if (!SCOPES.has(scope)) {
    return NextResponse.json({ error: "scope must be ENTITY_LEVEL or ATTRIBUTE_LEVEL" }, { status: 400 });
  }

  const graph = await getLineageGraph(assetType as LineageAssetType, assetId, scope as LineageScopeCode, up, down);
  return NextResponse.json(graph);
}
