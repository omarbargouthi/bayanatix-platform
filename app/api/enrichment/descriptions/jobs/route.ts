import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { runDescriptionJob } from "@/lib/enrichment/description-job";
import { parseAssetType } from "@/lib/enrichment/context";

// Bulk generate (spec §2.1 / §4). Body: { asset_type: "DATA_ENTITIES"|"DATA_ATTRIBUTES",
// asset_ids: number[], only_empty?: boolean, lang?: "en"|"ar" } -> { jobId }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const assetType = parseAssetType(String(body.asset_type ?? ""));
  if (!assetType) return NextResponse.json({ error: "asset_type must be DATA_ENTITIES or DATA_ATTRIBUTES" }, { status: 400 });

  const assetIds: number[] = Array.isArray(body.asset_ids) ? body.asset_ids.map(Number).filter(Number.isFinite) : [];
  if (assetIds.length === 0) return NextResponse.json({ error: "asset_ids must be a non-empty array" }, { status: 400 });

  const jobId = await runDescriptionJob(
    { assetType, assetIds, onlyEmpty: body.only_empty !== false, lang: body.lang },
    session.userId,
  );
  return NextResponse.json({ jobId }, { status: 202 });
}
