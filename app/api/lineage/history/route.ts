import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getLinkHistory } from "@/lib/lineage/register";

// GET ?lineageId= — the change history of one lineage link (who proposed what,
// when, through which request, and whether it was applied or rejected).
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lineageId = Number(new URL(req.url).searchParams.get("lineageId"));
  if (!Number.isFinite(lineageId)) return NextResponse.json({ error: "lineageId is required" }, { status: 400 });
  return NextResponse.json(await getLinkHistory(lineageId));
}
