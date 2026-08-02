import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entityId = searchParams.get("entityId");
  const attributeId = searchParams.get("attributeId");

  const rows = await sql<{
    linkId: number; fkAttributeId: number; fkColumn: string; fkTable: string;
    referencedAttributeId: number; refColumn: string; refTable: string;
    discoveryMethod: string; confidence: number;
  }[]>`
    SELECT
      l.link_id AS "linkId", l.fk_attribute_id AS "fkAttributeId", fka.physical_name_text AS "fkColumn", fke.entity_name_text AS "fkTable",
      l.referenced_attribute_id AS "referencedAttributeId", refa.physical_name_text AS "refColumn", refe.entity_name_text AS "refTable",
      l.discovery_method_code AS "discoveryMethod", l.confidence_number AS confidence
    FROM bayanat.attribute_reference_links l
    JOIN bayanat.data_attributes fka ON fka.attribute_id = l.fk_attribute_id
    JOIN bayanat.data_entities fke ON fke.entity_id = fka.entity_id
    JOIN bayanat.data_attributes refa ON refa.attribute_id = l.referenced_attribute_id
    JOIN bayanat.data_entities refe ON refe.entity_id = refa.entity_id
    WHERE (${entityId ?? null}::int IS NULL OR fka.entity_id = ${entityId ?? null}::int)
      AND (${attributeId ?? null}::int IS NULL OR l.fk_attribute_id = ${attributeId ?? null}::int)
    ORDER BY l.link_id
  `;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const fkAttributeId = Number(body.fk_attribute_id);
  const referencedAttributeId = Number(body.referenced_attribute_id);
  if (!Number.isFinite(fkAttributeId) || !Number.isFinite(referencedAttributeId)) {
    return NextResponse.json({ error: "fk_attribute_id and referenced_attribute_id are required" }, { status: 400 });
  }
  if (fkAttributeId === referencedAttributeId) return NextResponse.json({ error: "A column cannot reference itself" }, { status: 400 });

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.attribute_reference_links
      (fk_attribute_id, referenced_attribute_id, constraint_name_text, discovery_method_code, confidence_number)
    VALUES (${fkAttributeId}, ${referencedAttributeId}, ${body.constraint_name_text ?? null}, 'MANUAL', 1.0)
    ON CONFLICT (fk_attribute_id, referenced_attribute_id) DO UPDATE SET
      discovery_method_code = 'MANUAL', confidence_number = 1.0, discovered_at_timestamp = NOW()
    RETURNING link_id AS id
  `;
  await sql`UPDATE bayanat.data_attributes SET is_foreign_key_indicator = true WHERE attribute_id = ${fkAttributeId}`;
  return NextResponse.json({ linkId: row.id }, { status: 201 });
}
