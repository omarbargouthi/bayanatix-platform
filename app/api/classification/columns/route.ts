import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export type ClassificationColumn = {
  attributeId:             number;
  physicalName:            string;
  dataType:                string;
  columnType:              string | null;
  entityName:              string;
  entityId:                number;
  schemaName:              string;
  schemaId:                number;
  sourceName:              string;
  classTermId:             number | null;
  classTermName:           string | null;
  classTermClassCode:      string | null;
  classTermIsPii:          boolean;
  classTermPiCategoryName: string | null;
};

type Row = ClassificationColumn & { total: number };

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filter   = searchParams.get("filter") ?? "all";
  const search   = (searchParams.get("search") ?? "").trim();
  const schemaId = searchParams.get("schemaId") ? Number(searchParams.get("schemaId")) : null;
  const page     = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit    = Math.min(100, Math.max(10, Number(searchParams.get("limit") ?? "50")));
  const offset   = (page - 1) * limit;
  const like     = "%" + search + "%";
  const cdeCodes = ["CONFIDENTIAL", "SECRET", "TOP_SECRET"];

  const rows = await sql<Row[]>`
    SELECT
      a.attribute_id                      AS "attributeId",
      a.physical_name_text                AS "physicalName",
      a.data_type_text                    AS "dataType",
      a.attribute_class_code              AS "columnType",
      e.entity_name_text                  AS "entityName",
      e.entity_id                         AS "entityId",
      s.schema_name_text                  AS "schemaName",
      s.schema_id                         AS "schemaId",
      COALESCE(ds.source_name_text, '')   AS "sourceName",
      bg.glossary_id                      AS "classTermId",
      bg.term_name_text                   AS "classTermName",
      bg.classification_code              AS "classTermClassCode",
      COALESCE(bg.is_pii_indicator, false) AS "classTermIsPii",
      pct.category_name_text              AS "classTermPiCategoryName",
      COUNT(*) OVER()::int                AS total
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities  e   ON e.entity_id      = a.entity_id
    JOIN bayanat.data_schemas   s   ON s.schema_id      = e.schema_id
    LEFT JOIN bayanat.data_sources  ds  ON ds.data_source_id = s.data_source_id
    LEFT JOIN bayanat.asset_business_terms abt
      ON  abt.asset_type_code = 'DATA_ATTRIBUTES'
      AND abt.asset_id        = a.attribute_id
      AND abt.term_role       = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries  bg  ON bg.glossary_id   = abt.glossary_id
    LEFT JOIN bayanat.pi_category_types    pct ON pct.category_code = bg.pi_category_code
    WHERE
      ${filter === "classified"   ? sql`abt.glossary_id IS NOT NULL`                     : sql`true`}
      AND ${filter === "unclassified" ? sql`abt.glossary_id IS NULL`                     : sql`true`}
      AND ${filter === "cde"      ? sql`bg.classification_code = ANY(${cdeCodes})`       : sql`true`}
      AND ${schemaId != null      ? sql`s.schema_id = ${schemaId}`                       : sql`true`}
      AND ${search !== ""         ? sql`(
            a.physical_name_text ILIKE ${like}
            OR e.entity_name_text ILIKE ${like}
            OR s.schema_name_text ILIKE ${like}
            OR bg.term_name_text  ILIKE ${like}
          )`                                                                              : sql`true`}
    ORDER BY s.schema_name_text, e.entity_name_text, a.attribute_id
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = Number(rows[0]?.total ?? 0);
  const data: ClassificationColumn[] = rows.map(({ total: _t, ...r }) => ({
    ...r,
    attributeId:  Number(r.attributeId),
    entityId:     Number(r.entityId),
    schemaId:     Number(r.schemaId),
    classTermId:  r.classTermId != null ? Number(r.classTermId) : null,
  }));

  return NextResponse.json({ data, total, page, limit });
}
