import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClassificationStatsScoped } from "@/lib/queries/catalog";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const dataSourceId = searchParams.get("dataSourceId") ? Number(searchParams.get("dataSourceId")) : undefined;
  const stats = await getClassificationStatsScoped({ sourceId: dataSourceId });
  return NextResponse.json(stats);
}
