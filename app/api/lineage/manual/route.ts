import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ensureExternalEntity } from "@/lib/lineage/manual-edges";
import { MANUAL_OBJECT_TYPES } from "@/lib/object-types";
import { submitLineageChanges, describeEdge, type LineageOp } from "@/lib/lineage/changes";

type Endpoint = { entityId?: number | null; external?: { name: string; objectTypeCode: string } | null };
type Body = {
  source: Endpoint;
  target: Endpoint;
  transformationTypeCode?: string;
  transformationLogicText?: string;
  columnMappings?: { sourceAttributeId: number; targetAttributeId: number; transformationTypeCode?: string; expression?: string }[];
};

async function resolveEndpoint(ep: Endpoint): Promise<number | { error: string }> {
  if (ep.entityId != null) {
    if (!Number.isFinite(ep.entityId)) return { error: "Invalid table" };
    const [row] = await sql`SELECT 1 FROM bayanat.data_entities WHERE entity_id = ${ep.entityId}`;
    return row ? Number(ep.entityId) : { error: `Table #${ep.entityId} not found` };
  }
  const name = ep.external?.name?.trim();
  if (!name) return { error: "Pick a table or name an external asset for both sides" };
  if (name.length > 200) return { error: "External asset name is too long" };
  const objectType = ep.external?.objectTypeCode ?? "UNKNOWN";
  if (!(MANUAL_OBJECT_TYPES as string[]).includes(objectType)) return { error: "Invalid object type" };
  return ensureExternalEntity(name, objectType);
}

// POST — propose a manual lineage link between two tables (or external assets),
// optionally with column-level mappings. Goes through LINEAGE_CHANGE approval when
// a workflow is mapped, otherwise applies at once; recorded either way. Steward/admin only.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  }

  const body: Body = await req.json();
  const src = await resolveEndpoint(body.source ?? {});
  if (typeof src !== "number") return NextResponse.json(src, { status: 400 });
  const tgt = await resolveEndpoint(body.target ?? {});
  if (typeof tgt !== "number") return NextResponse.json(tgt, { status: 400 });
  if (src === tgt) return NextResponse.json({ error: "Source and target must be different" }, { status: 400 });

  const typeCode = body.transformationTypeCode || "MANUAL";
  const logic = body.transformationLogicText?.trim() || null;
  const mappings = (body.columnMappings ?? []).filter((m) => Number.isFinite(m.sourceAttributeId) && Number.isFinite(m.targetAttributeId));

  // Every mapped column must belong to the table on its side of the link.
  if (mappings.length > 0) {
    const ids = mappings.flatMap((m) => [m.sourceAttributeId, m.targetAttributeId]);
    const owners = await sql<{ id: number; entityId: number }[]>`
      SELECT attribute_id AS id, entity_id AS "entityId" FROM bayanat.data_attributes WHERE attribute_id = ANY(${ids})
    `;
    const ownerOf = new Map(owners.map((o) => [Number(o.id), Number(o.entityId)]));
    const bad = mappings.find((m) => ownerOf.get(m.sourceAttributeId) !== src || ownerOf.get(m.targetAttributeId) !== tgt);
    if (bad) return NextResponse.json({ error: "A mapped column does not belong to the selected table" }, { status: 400 });
  }

  try {
    const ops: LineageOp[] = [
      { op: "CREATE", scope: "ENTITY_LEVEL", sourceId: src, targetId: tgt, typeCode, logic },
      ...mappings.map((m): LineageOp => ({
        op: "CREATE", scope: "ATTRIBUTE_LEVEL", sourceId: m.sourceAttributeId, targetId: m.targetAttributeId,
        typeCode: m.transformationTypeCode || "DIRECT", logic: m.expression?.trim() || null,
      })),
    ];
    const result = await submitLineageChanges(ops, session.userId, {
      origin: "DIALOG", title: `Add lineage: ${await describeEdge("ENTITY_LEVEL", src, tgt)}`,
    });
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json({ ...result, columnEdges: mappings.length, sourceEntityId: src, targetEntityId: tgt }, { status: 201 });
  } catch (err) {
    console.error("[lineage manual create]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save lineage" }, { status: 500 });
  }
}
