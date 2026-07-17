import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

// GET /api/sharing/entities/[id] — attributes of an entity for the DSA attribute picker
export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entityId = Number(params.id);
  if (!Number.isFinite(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const rows = await sql`
    SELECT
      a.attribute_id                              AS "attributeId",
      a.physical_name_text                        AS "physicalName",
      a.friendly_name_text                        AS "friendlyName",
      a.data_type_text                            AS "dataType",
      ct.class_code                               AS "liveClassCode",
      COALESCE(bg.is_pii_indicator, false)        AS "liveIsPii"
    FROM bayanat.data_attributes a
    LEFT JOIN bayanat.asset_business_terms abt
      ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries bg  ON bg.glossary_id = abt.glossary_id
    LEFT JOIN bayanat.classification_types ct ON ct.class_code  = bg.classification_code
    WHERE a.entity_id = ${entityId}
    ORDER BY a.physical_name_text
  `;

  return NextResponse.json(rows.map(r => ({ ...r, attributeId: Number(r.attributeId) })));
}
