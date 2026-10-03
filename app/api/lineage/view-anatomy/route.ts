import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getViewAnatomy } from "@/lib/lineage/view-anatomy";

// GET ?entityId= — how a view is built (sources, joins, filters, grouping, output
// columns), parsed from its definition captured by the lineage scan. Read-only.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entityId = Number(new URL(req.url).searchParams.get("entityId"));
  if (!Number.isFinite(entityId)) return NextResponse.json({ error: "entityId is required" }, { status: 400 });
  const result = await getViewAnatomy(entityId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
