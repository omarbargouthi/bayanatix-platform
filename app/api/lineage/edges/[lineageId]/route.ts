import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logUpdate } from "@/lib/audit";
import { submitLineageChanges, describeEdge } from "@/lib/lineage/changes";

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
    note?: string;
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

  // Edits go through approval (LINEAGE_CHANGE) and are recorded in the link's history.
  const [edge] = await sql<{ scope: "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL"; s: number; t: number }[]>`
    SELECT lineage_scope_code AS scope, source_asset_id AS s, target_asset_id AS t FROM bayanat.data_lineage WHERE lineage_id = ${lineageId}
  `;
  const result = await submitLineageChanges([{
    op: "UPDATE", lineageId,
    typeCode: body.transformationTypeCode ?? existing.transformationTypeCode ?? "MANUAL",
    logic: body.transformationLogicText !== undefined ? (body.transformationLogicText.trim() || null) : existing.transformationLogicText,
  }], session.userId, { origin: "REGISTER", title: `Edit lineage: ${await describeEdge(edge.scope, Number(edge.s), Number(edge.t))}`, note: body.note });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

// DELETE — propose removing a MANUAL lineage link (steward/admin only), through
// LINEAGE_CHANGE approval. Scanned links aren't removed by hand: raise a
// review request against them instead (POST /api/lineage/review).
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  }

  const lineageId = Number(params.lineageId);
  if (!Number.isFinite(lineageId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [existing] = await sql<{ scope: "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL"; s: number; t: number }[]>`
    SELECT lineage_scope_code AS scope, source_asset_id AS s, target_asset_id AS t FROM bayanat.data_lineage WHERE lineage_id = ${lineageId}
  `;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const note = new URL(req.url).searchParams.get("note");
  const result = await submitLineageChanges([{ op: "DELETE", lineageId }], session.userId, {
    origin: "REGISTER", title: `Remove lineage: ${await describeEdge(existing.scope, Number(existing.s), Number(existing.t))}`, note,
  });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
