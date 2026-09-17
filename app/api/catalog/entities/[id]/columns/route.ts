import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entityId = Number(params.id);
  if (isNaN(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const rows = await sql<{
    attributeId: number; physicalName: string; friendlyName: string | null;
    dataType: string; isPrimaryKey: boolean;
  }[]>`
    SELECT
      attribute_id AS "attributeId",
      physical_name_text AS "physicalName",
      friendly_name_text AS "friendlyName",
      data_type_text AS "dataType",
      COALESCE(is_primary_key_indicator, false) AS "isPrimaryKey"
    FROM bayanat.data_attributes
    WHERE entity_id = ${entityId}
    ORDER BY is_primary_key_indicator DESC NULLS LAST, physical_name_text
  `;
  return NextResponse.json(rows);
}
