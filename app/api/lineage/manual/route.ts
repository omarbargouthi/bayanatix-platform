import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logUpdate } from "@/lib/audit";
import { ensureDataSource, ensureSchema, ensureEntity } from "@/lib/lineage/catalog-upsert";
import type { LineageLayerCode } from "@/lib/queries/lineage";

const LAYERS = new Set(["SOURCE", "RAW", "STAGING", "TABLE", "VIEW", "LAKEHOUSE", "SEMANTIC_MODEL", "REPORT"]);

type Endpoint = { entityId?: number | null; external?: { name: string; layerCode: string } | null };
type Body = {
  source: Endpoint;
  target: Endpoint;
  transformationTypeCode?: string;
  transformationLogicText?: string;
  columnMappings?: { sourceAttributeId: number; targetAttributeId: number; transformationTypeCode?: string; expression?: string }[];
};

// Endpoints that aren't in the catalog (an application, a file feed, a report
// tool) are recorded as entities under one "External systems" source, so the
// graph, impact analysis and propagation treat them like any other node.
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
  if (!LAYERS.has(layer)) return { error: "Invalid layer" };
  const dsId = await ensureDataSource("External systems", "EXTERNAL", null, "external");
  const schemaId = await ensureSchema(dsId, "manual");
  return ensureEntity(schemaId, name, layer === "VIEW", {
    layerCodeOverride: layer as LineageLayerCode,
    description: "Added manually as a lineage endpoint",
  });
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

  const upsert = (tx: typeof sql, scope: string, assetType: string, from: number, to: number, type: string, text: string | null) => tx<{ id: number }[]>`
    INSERT INTO bayanat.data_lineage
      (lineage_scope_code, source_asset_id, target_asset_id, asset_type_code,
       transformation_type_code, transformation_logic_text, provenance_code, is_confirmed, updated_by_user_id)
    VALUES (${scope}, ${from}, ${to}, ${assetType}, ${type}, ${text}, 'MANUAL', true, ${session.userId})
    ON CONFLICT (lineage_scope_code, source_asset_id, target_asset_id, COALESCE(process_id, -1))
    DO UPDATE SET transformation_type_code = EXCLUDED.transformation_type_code,
                  transformation_logic_text = EXCLUDED.transformation_logic_text,
                  updated_by_user_id = EXCLUDED.updated_by_user_id,
                  last_updated_timestamp = NOW()
    RETURNING lineage_id AS id
  `;

  try {
    const result = await sql.begin(async (tx) => {
      const [entityEdge] = await upsert(tx as unknown as typeof sql, "ENTITY_LEVEL", "DATA_ENTITIES", src, tgt, typeCode, logic);
      let columnEdges = 0;
      for (const m of mappings) {
        await upsert(tx as unknown as typeof sql, "ATTRIBUTE_LEVEL", "DATA_ATTRIBUTES", m.sourceAttributeId, m.targetAttributeId,
          m.transformationTypeCode || "DIRECT", m.expression?.trim() || null);
        columnEdges++;
      }
      return { lineageId: Number(entityEdge.id), columnEdges };
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
