import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const schemaIdRaw = searchParams.get("schemaId");

  if (!schemaIdRaw) {
    return NextResponse.json({ error: "schemaId is required" }, { status: 400 });
  }

  const schemaId = Number(schemaIdRaw);
  if (!Number.isFinite(schemaId)) {
    return NextResponse.json({ error: "Invalid schemaId" }, { status: 400 });
  }

  const [schemaRows, entityRows, attributeRows] = await Promise.all([
    sql<{ schemaName: string }[]>`
      SELECT schema_name_text AS "schemaName"
      FROM bayanat.data_schemas
      WHERE schema_id = ${schemaId}
      LIMIT 1
    `,

    sql<{ entityId: number; entityName: string; rowCount: number | null; isView: boolean }[]>`
      SELECT
        entity_id           AS "entityId",
        entity_name_text    AS "entityName",
        row_count_estimate  AS "rowCount",
        is_view_indicator   AS "isView"
      FROM bayanat.data_entities
      WHERE schema_id = ${schemaId}
      ORDER BY entity_name_text
    `,

    sql<{
      entityId: number;
      attributeId: number;
      name: string;
      dataType: string | null;
      isPk: boolean;
      isNullable: boolean;
    }[]>`
      SELECT
        da.entity_id                AS "entityId",
        da.attribute_id             AS "attributeId",
        da.physical_name_text       AS name,
        da.data_type_text           AS "dataType",
        da.is_primary_key_indicator AS "isPk",
        da.is_nullable_indicator    AS "isNullable"
      FROM bayanat.data_attributes da
      JOIN bayanat.data_entities de ON de.entity_id = da.entity_id
      WHERE de.schema_id = ${schemaId}
      ORDER BY da.entity_id, da.is_primary_key_indicator DESC, da.attribute_id
    `,
  ]);

  if (schemaRows.length === 0) {
    return NextResponse.json({ error: "Schema not found" }, { status: 404 });
  }

  const entityIds = entityRows.map((e) => e.entityId);

  const edgeRows =
    entityIds.length > 0
      ? await sql<{ lineageId: number; sourceId: number; targetId: number }[]>`
          SELECT
            lineage_id          AS "lineageId",
            source_asset_id     AS "sourceId",
            target_asset_id     AS "targetId"
          FROM bayanat.data_lineage
          WHERE asset_type_code = 'DATA_ENTITIES'
            AND source_asset_id = ANY(${entityIds})
            AND target_asset_id = ANY(${entityIds})
        `
      : [];

  type AttrRow = {
    entityId: number;
    attributeId: number;
    name: string;
    dataType: string | null;
    isPk: boolean;
    isNullable: boolean;
  };

  const attrsByEntity = new Map<number, AttrRow[]>();
  for (const attr of attributeRows) {
    const list = attrsByEntity.get(attr.entityId) ?? [];
    list.push(attr);
    attrsByEntity.set(attr.entityId, list);
  }

  const entities = entityRows.map((e) => ({
    entityId: e.entityId,
    entityName: e.entityName,
    rowCount: e.rowCount,
    isView: e.isView,
    columns: (attrsByEntity.get(e.entityId) ?? []).map((a) => ({
      attributeId: a.attributeId,
      name: a.name,
      dataType: a.dataType,
      isPk: a.isPk,
      isNullable: a.isNullable,
    })),
  }));

  const edges = edgeRows.map((r) => ({
    id: `e-${r.lineageId}`,
    sourceId: r.sourceId,
    targetId: r.targetId,
  }));

  return NextResponse.json({ schemaName: schemaRows[0].schemaName, entities, edges });
}
