import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export type SearchResult = {
  type: "TABLE" | "COLUMN" | "SCHEMA" | "SOURCE";
  id: number;
  name: string;
  description: string | null;
  meta: string | null;   // schema name, entity name, etc.
  href: string;
};

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const like = `%${q}%`;

  const [tables, columns, schemas, sources] = await Promise.all([
    sql<{ id: number; name: string; desc: string | null; schema: string | null; schemaId: number | null }[]>`
      SELECT e.entity_id AS id, e.entity_name_text AS name,
             e.description_text AS desc, s.schema_name_text AS schema,
             e.schema_id AS "schemaId"
      FROM bayanat.data_entities e
      LEFT JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE e.entity_name_text ILIKE ${like}
         OR e.display_name_text ILIKE ${like}
         OR e.description_text ILIKE ${like}
      ORDER BY e.entity_name_text
      LIMIT 8
    `,
    sql<{ id: number; name: string; desc: string | null; entityName: string | null; entityId: number; schemaId: number | null }[]>`
      SELECT a.attribute_id AS id, a.physical_name_text AS name,
             a.description_text AS desc, e.entity_name_text AS "entityName",
             a.entity_id AS "entityId", e.schema_id AS "schemaId"
      FROM bayanat.data_attributes a
      LEFT JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
      WHERE a.physical_name_text ILIKE ${like}
         OR a.friendly_name_text ILIKE ${like}
         OR a.description_text ILIKE ${like}
      ORDER BY a.physical_name_text
      LIMIT 8
    `,
    sql<{ id: number; name: string; desc: string | null }[]>`
      SELECT schema_id AS id, schema_name_text AS name, description_text AS desc
      FROM bayanat.data_schemas
      WHERE schema_name_text ILIKE ${like} OR description_text ILIKE ${like}
      ORDER BY schema_name_text LIMIT 4
    `,
    sql<{ id: number; name: string; desc: string | null }[]>`
      SELECT data_source_id AS id, source_name_text AS name, description_text AS desc
      FROM bayanat.data_sources
      WHERE source_name_text ILIKE ${like} OR description_text ILIKE ${like}
      ORDER BY source_name_text LIMIT 4
    `,
  ]);

  const results: SearchResult[] = [
    ...tables.map(r => ({
      type: "TABLE" as const,
      id: r.id, name: r.name, description: r.desc, meta: r.schema,
      href: r.schemaId ? `/catalog/${r.schemaId}/tables/${r.id}` : `/catalog`,
    })),
    ...columns.map(r => ({
      type: "COLUMN" as const,
      id: r.id, name: r.name, description: r.desc, meta: r.entityName,
      href: r.schemaId && r.entityId ? `/catalog/${r.schemaId}/tables/${r.entityId}` : `/catalog`,
    })),
    ...schemas.map(r => ({
      type: "SCHEMA" as const,
      id: r.id, name: r.name, description: r.desc, meta: null,
      href: `/catalog/${r.id}`,
    })),
    ...sources.map(r => ({
      type: "SOURCE" as const,
      id: r.id, name: r.name, description: r.desc, meta: null,
      href: `/catalog`,
    })),
  ];

  return NextResponse.json(results);
}
