import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logUpdate } from "@/lib/audit";
import { ensureExternalEntity, upsertManualEdge, LINEAGE_LAYERS } from "@/lib/lineage/manual-edges";

type Endpoint = { entityId?: number | null; external?: { name: string; layerCode: string } | null };
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
  const layer = ep.external?.layerCode ?? "SOURCE";
  if (!(LINEAGE_LAYERS as readonly string[]).includes(layer)) return { error: "Invalid layer" };
  return ensureExternalEntity(name, layer);
}

// POST — create a manual lineage link between two tables (or external assets),
// optionally with column-level mappings, in one transaction. Steward/admin only.
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
    const result = await sql.begin(async (tx) => {
      const t = tx as unknown as typeof sql;
      const lineageId = await upsertManualEdge(t, { scope: "ENTITY_LEVEL", sourceId: src, targetId: tgt, typeCode, logic, userId: session.userId });
      for (const m of mappings) {
        await upsertManualEdge(t, {
          scope: "ATTRIBUTE_LEVEL", sourceId: m.sourceAttributeId, targetId: m.targetAttributeId,
          typeCode: m.transformationTypeCode || "DIRECT", logic: m.expression?.trim() || null, userId: session.userId,
        });
      }
      return { lineageId: lineageId as number, columnEdges: mappings.length };
    });

    await logUpdate("DATA_ENTITIES", tgt, session.userId, [
      { field: "lineage_edge", oldVal: null, newVal: `Manual lineage from table #${src}${result.columnEdges ? ` (${result.columnEdges} column mapping(s))` : ""}` },
    ]);

    return NextResponse.json({ ...result, sourceEntityId: src, targetEntityId: tgt }, { status: 201 });
  } catch (err) {
    console.error("[lineage manual create]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save lineage" }, { status: 500 });
  }
}
