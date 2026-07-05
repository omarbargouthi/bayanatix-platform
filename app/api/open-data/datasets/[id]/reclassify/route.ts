import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { startWorkflow } from "@/lib/workflow";

type Ctx = { params: { id: string } };

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId = Number(params.id);

  // Verify dataset ownership
  const [ds] = await sql<{ raisedBy: string; datasetName: string }[]>`
    SELECT raised_by_user_id AS "raisedBy", dataset_name_text AS "datasetName"
    FROM bayanat.open_datasets WHERE dataset_id = ${datasetId}
  `;
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ds.raisedBy !== session.userId && session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: { attributeId: number; newTermId: number; reason: string } = await req.json();
  const { attributeId, newTermId, reason } = body;

  if (!attributeId || !newTermId || !reason?.trim()) {
    return NextResponse.json({ error: "attributeId, newTermId, and reason are required" }, { status: 400 });
  }

  // Verify the column belongs to this dataset
  const [odCol] = await sql<{ odColumnId: number }[]>`
    SELECT od_column_id AS "odColumnId"
    FROM bayanat.open_dataset_columns
    WHERE dataset_id = ${datasetId} AND attribute_id = ${attributeId}
  `;
  if (!odCol) return NextResponse.json({ error: "Column not in this dataset" }, { status: 404 });

  // Get current classification term for the column (for the audit note)
  const [oldTerm] = await sql<{ glossaryId: number; termName: string; currentDef: string | null }[]>`
    SELECT bg.glossary_id AS "glossaryId", bg.term_name_text AS "termName",
           bg.definition_text AS "currentDef"
    FROM bayanat.asset_business_terms abt
    JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
    WHERE abt.asset_type_code = 'DATA_ATTRIBUTES'
      AND abt.asset_id        = ${attributeId}
      AND abt.term_role       = 'CLASSIFICATION'
  `;

  // Get physical name for the audit note
  const [attrRow] = await sql<{ physicalName: string }[]>`
    SELECT physical_name_text AS "physicalName" FROM bayanat.data_attributes WHERE attribute_id = ${attributeId}
  `;
  const physicalName = attrRow?.physicalName ?? `attribute #${attributeId}`;

  // Get new (public) term info
  const [newTerm] = await sql<{ termName: string; classCode: string | null; isPii: boolean }[]>`
    SELECT term_name_text AS "termName", classification_code AS "classCode",
           COALESCE(is_pii_indicator, false) AS "isPii"
    FROM bayanat.business_glossaries WHERE glossary_id = ${newTermId}
  `;
  if (!newTerm) return NextResponse.json({ error: "Target term not found" }, { status: 404 });

  // ── 1. Re-assign classification term ─────────────────────────────────────
  await sql`
    DELETE FROM bayanat.asset_business_terms
    WHERE asset_type_code = 'DATA_ATTRIBUTES' AND asset_id = ${attributeId} AND term_role = 'CLASSIFICATION'
  `;
  await sql`
    INSERT INTO bayanat.asset_business_terms
      (glossary_id, asset_type_code, asset_id, linked_by, term_role)
    VALUES (${newTermId}, 'DATA_ATTRIBUTES', ${attributeId}, ${session.userId}, 'CLASSIFICATION')
    ON CONFLICT DO NOTHING
  `;

  // ── 2. Append audit note to the OLD term's definition ────────────────────
  if (oldTerm) {
    const today      = new Date().toISOString().slice(0, 10);
    const auditNote  =
      `\n\n[Re-classification note, ${today}]: ` +
      `Column "${physicalName}" was re-classified from this term to "${newTerm.termName}" ` +
      `for open data publication (dataset: "${ds.datasetName}"). ` +
      `Reason: ${reason.trim()}`;

    await sql`
      UPDATE bayanat.business_glossaries
      SET definition_text = COALESCE(definition_text, '') || ${auditNote}
      WHERE glossary_id = ${oldTerm.glossaryId}
    `;
  }

  // ── 3. Create CLASSIFY_ASSET request and start workflow ──────────────────
  const title = `Re-classify "${physicalName}" as "${newTerm.termName}" for open data`;

  const [reqRow] = await sql<{ requestId: number }[]>`
    INSERT INTO bayanat.asset_requests
      (request_type_code, title, description_text, priority_code, raised_by_user_id)
    VALUES (
      'CLASSIFY_ASSET',
      ${title},
      ${"Re-classification for open data publication.\n\nReason: " + reason.trim() +
        (oldTerm ? `\n\nPrevious classification: ${oldTerm.termName}` : "") +
        `\nNew classification: ${newTerm.termName}`},
      'HIGH',
      ${session.userId}
    )
    RETURNING request_id AS "requestId"
  `;

  await sql`
    INSERT INTO bayanat.asset_request_targets
      (request_id, asset_type_code, asset_id, asset_name)
    VALUES (${reqRow.requestId}, 'DATA_ATTRIBUTES', ${attributeId}, ${physicalName})
  `;

  await startWorkflow(reqRow.requestId, "CLASSIFY_ASSET", title);

  // ── 4. Record reason and request on the dataset column ───────────────────
  await sql`
    UPDATE bayanat.open_dataset_columns
    SET reclassification_reason     = ${reason.trim()},
        reclassification_request_id = ${reqRow.requestId}
    WHERE od_column_id = ${odCol.odColumnId}
  `;

  await sql`UPDATE bayanat.open_datasets SET updated_at = NOW() WHERE dataset_id = ${datasetId}`;

  return NextResponse.json({
    ok:        true,
    requestId: reqRow.requestId,
    newTermName: newTerm.termName,
    newTermCode: newTerm.classCode,
    isPii:       newTerm.isPii,
  });
}
