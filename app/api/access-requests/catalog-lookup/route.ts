import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// Cascading Data Source → Schema → Table lookup for the Request Access picker.
// Deliberately unfiltered by view permission — the whole point is to let a
// user browse and request access to something they can't see yet — unlike
// the gated /api/catalog/** listing endpoints. Any logged-in user may call it.
// ?type=sources | ?type=schemas&sourceId=N | ?type=tables&schemaId=N
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  if (type === "sources") {
    const rows = await sql`
      SELECT data_source_id AS "id", source_name_text AS "name"
      FROM bayanat.data_sources ORDER BY source_name_text
    `;
    return NextResponse.json(rows);
  }

  if (type === "schemas") {
    const sourceId = Number(searchParams.get("sourceId"));
    if (!Number.isFinite(sourceId)) return NextResponse.json({ error: "sourceId required" }, { status: 400 });
    const rows = await sql`
      SELECT schema_id AS "id", schema_name_text AS "name"
      FROM bayanat.data_schemas WHERE data_source_id = ${sourceId} ORDER BY schema_name_text
    `;
    return NextResponse.json(rows);
  }

  if (type === "tables") {
    const schemaId = Number(searchParams.get("schemaId"));
    if (!Number.isFinite(schemaId)) return NextResponse.json({ error: "schemaId required" }, { status: 400 });
    const rows = await sql`
      SELECT entity_id AS "id", COALESCE(display_name_text, entity_name_text) AS "name"
      FROM bayanat.data_entities WHERE schema_id = ${schemaId} ORDER BY entity_name_text
    `;
    return NextResponse.json(rows);
  }

  return NextResponse.json({ error: "type must be sources, schemas, or tables" }, { status: 400 });
}
