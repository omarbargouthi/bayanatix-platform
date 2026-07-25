import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logUpdate } from "@/lib/audit";

const ASSET_TYPES = new Set(["DATA_ENTITIES", "DATA_ATTRIBUTES"]);
const SCOPES = new Set(["ENTITY_LEVEL", "ATTRIBUTE_LEVEL"]);

// POST — manually create a lineage edge (steward/admin only)
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
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO bayanat.data_lineage
        (lineage_scope_code, source_asset_id, target_asset_id, asset_type_code,
         transformation_type_code, transformation_logic_text,
         provenance_code, is_confirmed, updated_by_user_id)
      VALUES
        (${body.scope}, ${body.sourceAssetId}, ${body.targetAssetId}, ${body.assetTypeCode},
         ${body.transformationTypeCode ?? "MANUAL"}, ${body.transformationLogicText ?? null},
         'MANUAL', true, ${session.userId})
      ON CONFLICT (lineage_scope_code, source_asset_id, target_asset_id, COALESCE(process_id, -1))
      DO UPDATE SET transformation_type_code = EXCLUDED.transformation_type_code,
                    transformation_logic_text = EXCLUDED.transformation_logic_text,
                    updated_by_user_id = EXCLUDED.updated_by_user_id,
                    last_updated_timestamp = NOW()
      RETURNING lineage_id AS id
    `;

    await logUpdate(body.assetTypeCode, body.targetAssetId, session.userId, [
      { field: "lineage_edge", oldVal: null, newVal: `Manual edge from asset #${body.sourceAssetId} (${body.scope})` },
    ]);

    return NextResponse.json({ lineageId: row.id }, { status: 201 });
  } catch (err) {
    console.error("[lineage edge create]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create edge" }, { status: 500 });
  }
}
