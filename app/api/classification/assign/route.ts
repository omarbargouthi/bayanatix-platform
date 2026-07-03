import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { sql } from "@/lib/db";
import { startWorkflow } from "@/lib/workflow";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: { attributeIds: number[]; classificationId: number | null } = await req.json();
  const { attributeIds, classificationId } = body;

  if (!Array.isArray(attributeIds) || attributeIds.length === 0) {
    return NextResponse.json({ error: "No attributes specified" }, { status: 400 });
  }

  // Resolve the term name for the request title
  let termName = "(remove classification)";
  if (classificationId != null) {
    const [term] = await sql<{ name: string }[]>`
      SELECT term_name_text AS name FROM bayanat.business_glossaries WHERE glossary_id = ${classificationId}
    `;
    termName = term?.name ?? String(classificationId);
  }

  // Apply classification term to each attribute
  for (const attrId of attributeIds) {
    // Remove existing CLASSIFICATION term
    await sql`
      DELETE FROM bayanat.asset_business_terms
      WHERE asset_type_code = 'DATA_ATTRIBUTES' AND asset_id = ${attrId} AND term_role = 'CLASSIFICATION'
    `;
    if (classificationId != null) {
      await sql`
        INSERT INTO bayanat.asset_business_terms
          (glossary_id, asset_type_code, asset_id, linked_by, term_role)
        VALUES (${classificationId}, 'DATA_ATTRIBUTES', ${attrId}, ${session.userId}, 'CLASSIFICATION')
        ON CONFLICT DO NOTHING
      `;
    }
  }

  // Create one asset_request covering all targets, then start classification workflow
  if (classificationId != null) {
    const attrNames = await sql<{ name: string; id: number }[]>`
      SELECT attribute_id AS id, physical_name_text AS name
      FROM bayanat.data_attributes WHERE attribute_id = ANY(${attributeIds})
    `;

    const title = attributeIds.length === 1
      ? `Classify column "${attrNames[0]?.name ?? attributeIds[0]}" as ${termName}`
      : `Bulk classify ${attributeIds.length} columns as ${termName}`;

    const [req_row] = await sql<{ requestId: number }[]>`
      INSERT INTO bayanat.asset_requests
        (request_type_code, title, description_text, priority_code, raised_by_user_id)
      VALUES ('CLASSIFY_ASSET', ${title}, ${`Classification term: ${termName}`}, 'MEDIUM', ${session.userId})
      RETURNING request_id AS "requestId"
    `;

    for (const attr of attrNames) {
      await sql`
        INSERT INTO bayanat.asset_request_targets
          (request_id, asset_type_code, asset_id, asset_name)
        VALUES (${req_row.requestId}, 'DATA_ATTRIBUTES', ${attr.id}, ${attr.name})
      `;
    }

    await startWorkflow(req_row.requestId, "CLASSIFY_ASSET", title);
  }

  return NextResponse.json({ ok: true, count: attributeIds.length });
}
