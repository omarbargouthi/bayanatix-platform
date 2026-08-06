import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getLinksForAsset } from "@/lib/queries/custom-assets";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assetType = searchParams.get("assetType") ?? "";
  const assetId = Number(searchParams.get("assetId"));
  if (!assetType || !assetId) return NextResponse.json({ error: "Missing assetType or assetId" }, { status: 400 });

  const links = await getLinksForAsset(assetType, assetId);
  return NextResponse.json(links);
}
