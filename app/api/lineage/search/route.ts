import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { searchLineageAssets } from "@/lib/queries/lineage";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json([]);

  const results = await searchLineageAssets(q);
  return NextResponse.json(results);
}
