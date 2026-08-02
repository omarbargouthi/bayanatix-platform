import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSuggestionsQueue } from "@/lib/queries/classification";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entityId     = searchParams.get("entityId");
  const schemaId     = searchParams.get("schemaId");
  const dataSourceId = searchParams.get("dataSourceId");
  const band   = searchParams.get("band") as "HIGH" | "MEDIUM" | "LOW" | null;
  const status = searchParams.get("status");
  const page   = Number(searchParams.get("page") ?? "1");
  const limit  = Number(searchParams.get("limit") ?? "50");

  const { rows, total } = await getSuggestionsQueue({
    entityId: entityId ? Number(entityId) : undefined,
    schemaId: schemaId ? Number(schemaId) : undefined,
    dataSourceId: dataSourceId ? Number(dataSourceId) : undefined,
    band: band ?? undefined,
    status: status ?? undefined,
    page, limit,
  });

  return NextResponse.json({ data: rows, total, page, limit });
}
