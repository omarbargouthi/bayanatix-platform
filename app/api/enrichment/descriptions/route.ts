import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSuggestionsQueue } from "@/lib/queries/enrichment-descriptions";
import type { AssetType } from "@/lib/enrichment/context";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const assetType = (searchParams.get("asset_type") as AssetType | null) ?? undefined;
  const entityId = searchParams.get("entity_id");
  const jobId = searchParams.get("job_id");
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "50");

  const { rows, total } = await getSuggestionsQueue({
    status, assetType, entityId: entityId ? Number(entityId) : undefined,
    jobId: jobId ? Number(jobId) : undefined, page, limit,
  });
  return NextResponse.json({ data: rows, total, page, limit });
}
