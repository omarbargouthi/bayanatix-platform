import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { createEntity } from "@/lib/queries/catalog";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || null;

  const rows = await sql<{
    entityId: number; entityName: string; schemaId: number; schemaName: string; sourceName: string;
  }[]>`
    SELECT e.entity_id AS "entityId", e.entity_name_text AS "entityName",
           e.schema_id AS "schemaId", s.schema_name_text AS "schemaName",
           ds.source_name_text AS "sourceName"
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    ${search ? sql`WHERE e.entity_name_text ILIKE ${"%" + search + "%"}` : sql``}
    ORDER BY e.entity_name_text
    LIMIT 200
  `;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const id = await createEntity(body);
  return NextResponse.json({ id }, { status: 201 });
}
