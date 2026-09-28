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
    dataType: string; isPrimaryKey: boolean; isPii: boolean;
  }[]>`
    SELECT
      a.attribute_id AS "attributeId",
      a.physical_name_text AS "physicalName",
      a.friendly_name_text AS "friendlyName",
      a.data_type_text AS "dataType",
      COALESCE(a.is_primary_key_indicator, false) AS "isPrimaryKey",
      COALESCE(bg_cls.is_pii_indicator, false) AS "isPii"
    FROM bayanat.data_attributes a
    LEFT JOIN bayanat.asset_business_terms abt_cls
      ON abt_cls.asset_type_code = 'DATA_ATTRIBUTES'
      AND abt_cls.asset_id = a.attribute_id
      AND abt_cls.term_role = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries bg_cls
      ON bg_cls.glossary_id = abt_cls.glossary_id
    WHERE a.entity_id = ${entityId}
    ORDER BY a.is_primary_key_indicator DESC NULLS LAST, a.physical_name_text
  `;
  return NextResponse.json(rows);
}
