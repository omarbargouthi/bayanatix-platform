import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// Cascading catalog lookup for FOI source mapping
// ?type=sources | ?type=entities&sourceId=N | ?type=attributes&entityId=N
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  try {
    if (type === "sources") {
      const rows = await sql`
        SELECT data_source_id AS "id", source_name_text AS "name", source_type_code AS "type"
        FROM bayanat.data_sources ORDER BY source_name_text
      `;
      return NextResponse.json(rows);
    }

    if (type === "entities") {
      const sourceId = Number(searchParams.get("sourceId"));
      if (!Number.isFinite(sourceId)) return NextResponse.json({ error: "sourceId required" }, { status: 400 });
      const rows = await sql`
        SELECT e.entity_id AS "id",
               e.entity_name_text AS "name",
               COALESCE(e.display_name_text, e.entity_name_text) AS "displayName"
        FROM bayanat.data_entities e
        JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
        WHERE s.data_source_id = ${sourceId}
        ORDER BY e.entity_name_text
      `;
      return NextResponse.json(rows);
    }

    if (type === "attributes") {
      const entityId = Number(searchParams.get("entityId"));
      if (!Number.isFinite(entityId)) return NextResponse.json({ error: "entityId required" }, { status: 400 });
      const rows = await sql`
        SELECT a.attribute_id AS "id",
               a.physical_name_text AS "name",
               COALESCE(a.friendly_name_text, a.physical_name_text) AS "displayName",
               a.data_type_text AS "dataType",
               a.description_text AS "description",
               -- Prefer the classification set through the catalog workflow (asset_business_terms → business_glossaries)
               -- Fall back to the direct field on data_attributes for legacy seed data
               COALESCE(bg.classification_code, a.classification_code) AS "classificationCode",
               bg.term_name_text AS "classificationTermName",
               ct.class_name_text AS "classificationLabel",
               -- classificationMapped = true means the code exists in classification_types and can be used directly as FOI sensitivity
               (ct.class_code IS NOT NULL) AS "classificationMapped"
        FROM bayanat.data_attributes a
        LEFT JOIN bayanat.asset_business_terms abt
          ON abt.asset_type_code = 'DATA_ATTRIBUTES'
         AND abt.asset_id        = a.attribute_id
         AND abt.term_role       = 'CLASSIFICATION'
        LEFT JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
        LEFT JOIN bayanat.classification_types ct
          ON ct.class_code = COALESCE(bg.classification_code, a.classification_code)
        WHERE a.entity_id = ${entityId}
        ORDER BY a.physical_name_text
      `;
      return NextResponse.json(rows);
    }

    return NextResponse.json({ error: "type must be sources, entities, or attributes" }, { status: 400 });
  } catch (err) {
    console.error("[FOI CATALOG LOOKUP]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
