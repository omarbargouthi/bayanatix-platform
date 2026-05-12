import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * Hierarchical catalog browser — used by the DQ AssetPicker.
 *
 * GET /api/catalog/browse?type=sources
 * GET /api/catalog/browse?type=schemas&sourceId=1
 * GET /api/catalog/browse?type=tables&schemaId=1
 * GET /api/catalog/browse?type=columns&entityId=1
 */

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp   = req.nextUrl.searchParams;
  const type = sp.get("type");

  if (type === "sources") {
    const rows = await sql<{ id: number; name: string; dbType: string | null; dbName: string | null }[]>`
      SELECT data_source_id AS id, source_name_text AS name,
             source_type_code AS "dbType", database_name_text AS "dbName"
      FROM bayanat.data_sources
      ORDER BY source_name_text
    `;
    return NextResponse.json(rows);
  }

  if (type === "schemas") {
    const sourceId = Number(sp.get("sourceId"));
    if (!sourceId) return NextResponse.json([]);
    const rows = await sql<{ id: number; name: string; tableCount: number }[]>`
      SELECT s.schema_id AS id, s.schema_name_text AS name,
             COUNT(e.entity_id)::int AS "tableCount"
      FROM bayanat.data_schemas s
      LEFT JOIN bayanat.data_entities e ON e.schema_id = s.schema_id
      WHERE s.data_source_id = ${sourceId}
      GROUP BY s.schema_id, s.schema_name_text
      ORDER BY s.schema_name_text
    `;
    return NextResponse.json(rows);
  }

  if (type === "tables") {
    const schemaId = Number(sp.get("schemaId"));
    if (!schemaId) return NextResponse.json([]);
    const rows = await sql<{ id: number; name: string; isView: boolean; rowCount: number | null; colCount: number }[]>`
      SELECT e.entity_id AS id, e.entity_name_text AS name,
             COALESCE(e.is_view_indicator, false) AS "isView",
             e.row_count_estimate AS "rowCount",
             COUNT(a.attribute_id)::int AS "colCount"
      FROM bayanat.data_entities e
      LEFT JOIN bayanat.data_attributes a ON a.entity_id = e.entity_id
      WHERE e.schema_id = ${schemaId}
      GROUP BY e.entity_id, e.entity_name_text, e.is_view_indicator, e.row_count_estimate
      ORDER BY e.entity_name_text
    `;
    return NextResponse.json(rows.map((r) => ({ ...r, isView: Boolean(r.isView), rowCount: r.rowCount != null ? Number(r.rowCount) : null })));
  }

  if (type === "columns") {
    const entityId = Number(sp.get("entityId"));
    if (!entityId) return NextResponse.json([]);
    const rows = await sql<{ id: number; name: string; dataType: string | null; isPk: boolean; isNullable: boolean; nullPct: number | null }[]>`
      SELECT attribute_id AS id, physical_name_text AS name,
             data_type_text AS "dataType",
             COALESCE(is_primary_key_indicator, false) AS "isPk",
             COALESCE(is_nullable_indicator, true) AS "isNullable",
             null_percentage AS "nullPct"
      FROM bayanat.data_attributes
      WHERE entity_id = ${entityId}
      ORDER BY ordinal_position_number, physical_name_text
    `;
    return NextResponse.json(rows.map((r) => ({ ...r, isPk: Boolean(r.isPk), isNullable: Boolean(r.isNullable), nullPct: r.nullPct != null ? Number(r.nullPct) : null })));
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
