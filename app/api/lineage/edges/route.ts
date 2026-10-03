import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { submitLineageChanges, describeEdge } from "@/lib/lineage/changes";

const ASSET_TYPES = new Set(["DATA_ENTITIES", "DATA_ATTRIBUTES"]);
const SCOPES = new Set(["ENTITY_LEVEL", "ATTRIBUTE_LEVEL"]);

// POST — propose one manual lineage edge (steward/admin only); approval + history via lib/lineage/changes.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  }

  const body: {
    scope: string; sourceAssetId: number; targetAssetId: number; assetTypeCode: string;
    transformationTypeCode?: string; transformationLogicText?: string;
  } = await req.json();

  if (!SCOPES.has(body.scope)) return NextResponse.json({ error: "scope must be ENTITY_LEVEL or ATTRIBUTE_LEVEL" }, { status: 400 });
  if (!ASSET_TYPES.has(body.assetTypeCode)) return NextResponse.json({ error: "assetTypeCode must be DATA_ENTITIES or DATA_ATTRIBUTES" }, { status: 400 });
  if (!Number.isFinite(body.sourceAssetId) || !Number.isFinite(body.targetAssetId)) {
    return NextResponse.json({ error: "sourceAssetId and targetAssetId are required" }, { status: 400 });
  }
  if (body.sourceAssetId === body.targetAssetId) {
    return NextResponse.json({ error: "A lineage edge cannot connect an asset to itself" }, { status: 400 });
  }

  try {
    const scope = body.scope as "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL";
    const result = await submitLineageChanges([{
      op: "CREATE", scope, sourceId: body.sourceAssetId, targetId: body.targetAssetId,
      typeCode: body.transformationTypeCode ?? "MANUAL", logic: body.transformationLogicText ?? null,
    }], session.userId, { origin: "DIALOG", title: `Add lineage: ${await describeEdge(scope, body.sourceAssetId, body.targetAssetId)}` });
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[lineage edge create]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create edge" }, { status: 500 });
  }
}
