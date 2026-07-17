import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// GET /api/sharing/entities?search=&limit=30
// Lightweight entity search for the DSA dataset picker
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const limit  = Math.min(Number(searchParams.get("limit") ?? 30), 100);
  const like   = "%" + search + "%";

  const rows = await sql`
    SELECT
      e.entity_id                           AS "entityId",
      e.entity_name_text                    AS "entityName",
      s.schema_name_text                    AS "schemaName",
      COALESCE(src.source_name_text, '')    AS "sourceName"
    FROM bayanat.data_entities  e
    JOIN bayanat.data_schemas   s   ON s.schema_id      = e.schema_id
    LEFT JOIN bayanat.data_sources src ON src.data_source_id = s.data_source_id
    WHERE ${search !== "" ? sql`e.entity_name_text ILIKE ${like} OR s.schema_name_text ILIKE ${like}` : sql`true`}
    ORDER BY e.entity_name_text
    LIMIT ${limit}
  `;

  return NextResponse.json(rows.map(r => ({ ...r, entityId: Number(r.entityId) })));
}
