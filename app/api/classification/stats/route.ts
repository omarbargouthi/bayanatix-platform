import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canViewAllClassification } from "@/lib/can";
import { getClassificationStatsScoped } from "@/lib/queries/catalog";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const dataSourceId = searchParams.get("dataSourceId") ? Number(searchParams.get("dataSourceId")) : undefined;
  const schemaId = searchParams.get("schemaId") ? Number(searchParams.get("schemaId")) : undefined;
  const restrictToUserId = (await canViewAllClassification(session)) ? undefined : session.userId;
  const stats = await getClassificationStatsScoped({ sourceId: dataSourceId, schemaId, restrictToUserId });
  return NextResponse.json(stats);
}
