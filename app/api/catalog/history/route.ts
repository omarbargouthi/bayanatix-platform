import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getHistory } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const assetType = searchParams.get("assetType") ?? "";
    const assetId   = Number(searchParams.get("assetId"));
    if (!assetType || isNaN(assetId)) {
      return NextResponse.json({ error: "assetType and assetId are required" }, { status: 400 });
    }

    const entries = await getHistory(assetType, assetId);
    return NextResponse.json(entries);
  } catch (err) {
    console.error("[GET /api/catalog/history]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
