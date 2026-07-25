import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logUpdate } from "@/lib/audit";

type Ctx = { params: { lineageId: string } };

// PATCH — confirm a SCANNED edge, or edit a MANUAL edge (steward/admin only)
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  }

  const lineageId = Number(params.lineageId);
  if (!Number.isFinite(lineageId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [existing] = await sql<{
    provenanceCode: string; isConfirmed: boolean; assetTypeCode: string; targetAssetId: number;
    transformationTypeCode: string | null; transformationLogicText: string | null;
  }[]>`
    SELECT provenance_code AS "provenanceCode", is_confirmed AS "isConfirmed",
           asset_type_code AS "assetTypeCode", target_asset_id AS "targetAssetId",
           transformation_type_code AS "transformationTypeCode", transformation_logic_text AS "transformationLogicText"
    FROM bayanat.data_lineage WHERE lineage_id = ${lineageId}
  `;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body: {
    action?: "confirm";
    transformationTypeCode?: string;
    transformationLogicText?: string;
  } = await req.json();

  if (body.action === "confirm") {
    await sql`
      UPDATE bayanat.data_lineage SET is_confirmed = true, last_updated_timestamp = NOW(), updated_by_user_id = ${session.userId}
      WHERE lineage_id = ${lineageId}
    `;
    await logUpdate(existing.assetTypeCode, existing.targetAssetId, session.userId, [
      { field: "lineage_edge_confirmed", oldVal: String(existing.isConfirmed), newVal: "true" },
    ]);
    return NextResponse.json({ ok: true });
  }

  // Editing transformation details: SCANNED edges may only be confirmed, not
  // rewritten (the scanner owns their content and would overwrite edits on
  // the next scan) — only MANUAL edges are freely editable.
  if (existing.provenanceCode !== "MANUAL") {
    return NextResponse.json({ error: "Only manually-curated edges can be edited — confirm a scanned edge instead" }, { status: 409 });
  }

  await sql`
    UPDATE bayanat.data_lineage SET
      transformation_type_code = COALESCE(${body.transformationTypeCode ?? null}, transformation_type_code),
      transformation_logic_text = COALESCE(${body.transformationLogicText ?? null}, transformation_logic_text),
      last_updated_timestamp = NOW(), updated_by_user_id = ${session.userId}
    WHERE lineage_id = ${lineageId}
  `;
  await logUpdate(existing.assetTypeCode, existing.targetAssetId, session.userId, [
    { field: "transformation_logic_text", oldVal: existing.transformationLogicText, newVal: body.transformationLogicText ?? existing.transformationLogicText },
  ]);

  return NextResponse.json({ ok: true });
}

// DELETE — remove a lineage edge (steward/admin only). Scanned edges can be
// deleted too (e.g. to correct a bad auto-extraction) — the next rescan of
// that process will simply recreate it if it's still genuinely present.
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  }

  const lineageId = Number(params.lineageId);
  if (!Number.isFinite(lineageId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [existing] = await sql<{ assetTypeCode: string; targetAssetId: number; sourceAssetId: number }[]>`
    SELECT asset_type_code AS "assetTypeCode", target_asset_id AS "targetAssetId", source_asset_id AS "sourceAssetId"
    FROM bayanat.data_lineage WHERE lineage_id = ${lineageId}
  `;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await sql`DELETE FROM bayanat.data_lineage WHERE lineage_id = ${lineageId}`;
  await logUpdate(existing.assetTypeCode, existing.targetAssetId, session.userId, [
    { field: "lineage_edge", oldVal: `from asset #${existing.sourceAssetId}`, newVal: null },
  ]);

  return NextResponse.json({ ok: true });
}
