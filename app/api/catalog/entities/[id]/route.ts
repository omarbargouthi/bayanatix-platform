import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { updateEntity } from "@/lib/queries/catalog";
import { sql } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entityId = Number(params.id);
  if (isNaN(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const rows = await sql<{ entityId: number; entityName: string; schemaName: string; sourceName: string }[]>`
    SELECT e.entity_id AS "entityId",
           e.entity_name_text AS "entityName",
           s.schema_name_text AS "schemaName",
           ds.source_name_text AS "sourceName"
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE e.entity_id = ${entityId}
    LIMIT 1
  `;
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const entityId = Number(params.id);
    if (isNaN(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { description, displayName, category } = await req.json();
    if (typeof description !== "string") {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }

    await updateEntity(entityId, session.userId, {
      description,
      displayName: displayName ?? "",
      category:    category    ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/catalog/entities/[id]]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
