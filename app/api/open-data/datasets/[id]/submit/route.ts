import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { startWorkflow } from "@/lib/workflow";

type Ctx = { params: { id: string } };

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId = Number(params.id);
  const body: { action?: "submit" | "revert_to_pending" | "publish" | "reject"; notes?: string } = await req.json();
  const action = body.action ?? "submit";

  const [ds] = await sql<{ raisedBy: string; status: string; name: string; hasPii: boolean }[]>`
    SELECT
      d.raised_by_user_id AS "raisedBy",
      d.status_code       AS "status",
      d.dataset_name_text AS "name",
      BOOL_OR(COALESCE(bg.is_pii_indicator, false)) AS "hasPii"
    FROM bayanat.open_datasets d
    LEFT JOIN bayanat.open_dataset_columns odc ON odc.dataset_id = d.dataset_id
    LEFT JOIN bayanat.asset_business_terms abt
      ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = odc.attribute_id AND abt.term_role = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
    WHERE d.dataset_id = ${datasetId}
    GROUP BY d.dataset_id
  `;

  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── Submit for approval ───────────────────────────────────────────────
  if (action === "submit") {
    if (ds.raisedBy !== session.userId && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (ds.status !== "DRAFT" && ds.status !== "PENDING") {
      return NextResponse.json({ error: "Dataset is not in DRAFT or PENDING status" }, { status: 409 });
    }

    // Verify at least one column is selected
    const [{ cnt }] = await sql<{ cnt: number }[]>`
      SELECT COUNT(*)::int AS cnt FROM bayanat.open_dataset_columns WHERE dataset_id = ${datasetId}
    `;
    if (cnt === 0) {
      return NextResponse.json({ error: "At least one column must be selected before submitting" }, { status: 400 });
    }

    // Block: restricted classifications without re-classification request
    const restrictedCodes = ["CONFIDENTIAL", "RESTRICTED", "SECRET", "TOP_SECRET", "PII"];
    const blockedCols = await sql<{ physicalName: string; classCode: string }[]>`
      SELECT a.physical_name_text AS "physicalName", bg.classification_code AS "classCode"
      FROM bayanat.open_dataset_columns odc
      JOIN bayanat.data_attributes       a   ON a.attribute_id   = odc.attribute_id
      LEFT JOIN bayanat.asset_business_terms abt
        ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = odc.attribute_id AND abt.term_role = 'CLASSIFICATION'
      LEFT JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
      WHERE odc.dataset_id = ${datasetId}
        AND bg.classification_code = ANY(${restrictedCodes})
        AND odc.reclassification_request_id IS NULL
    `;
    if (blockedCols.length > 0) {
      const names = blockedCols.map((c) => `"${c.physicalName}" (${c.classCode})`).join(", ");
      return NextResponse.json({
        error: `The following columns have restricted classification and must be re-classified as Public before submission: ${names}`,
        blockedColumns: blockedCols,
      }, { status: 400 });
    }

    // Block: columns with no classification term and no pending reclassification request
    const unclassifiedCols = await sql<{ physicalName: string }[]>`
      SELECT a.physical_name_text AS "physicalName"
      FROM bayanat.open_dataset_columns odc
      JOIN bayanat.data_attributes a ON a.attribute_id = odc.attribute_id
      LEFT JOIN bayanat.asset_business_terms abt
        ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = odc.attribute_id AND abt.term_role = 'CLASSIFICATION'
      WHERE odc.dataset_id = ${datasetId}
        AND abt.glossary_id IS NULL
        AND odc.reclassification_request_id IS NULL
    `;
    if (unclassifiedCols.length > 0) {
      const names = unclassifiedCols.map((c) => `"${c.physicalName}"`).join(", ");
      return NextResponse.json({
        error: `The following columns have no classification and must be classified before submission: ${names}`,
        unclassifiedColumns: unclassifiedCols,
      }, { status: 400 });
    }

    const title = `Publish open dataset: "${ds.name}"`;

    const [reqRow] = await sql<{ requestId: number }[]>`
      INSERT INTO bayanat.asset_requests
        (request_type_code, title, description_text, priority_code, raised_by_user_id)
      VALUES (
        'PUBLISH_OPEN_DATA',
        ${title},
        ${ds.hasPii ? "Dataset contains PII columns — Privacy Review stage is mandatory." : "Standard open data publication approval."},
        'MEDIUM',
        ${session.userId}
      )
      RETURNING request_id AS "requestId"
    `;

    await sql`
      INSERT INTO bayanat.asset_request_targets
        (request_id, asset_type_code, asset_id_text, asset_name)
      VALUES (${reqRow.requestId}, 'OPEN_DATASET', ${String(datasetId)}, ${ds.name})
    `;

    // Add data source targets so the workflow can resolve source owners
    const sourcesUsed = await sql<{ sourceId: number; sourceName: string }[]>`
      SELECT DISTINCT ds2.data_source_id AS "sourceId", ds2.source_name_text AS "sourceName"
      FROM bayanat.open_dataset_columns odc
      JOIN bayanat.data_attributes a   ON a.attribute_id   = odc.attribute_id
      JOIN bayanat.data_entities   en  ON en.entity_id     = a.entity_id
      JOIN bayanat.data_schemas    sch ON sch.schema_id    = en.schema_id
      JOIN bayanat.data_sources    ds2 ON ds2.data_source_id = sch.data_source_id
      WHERE odc.dataset_id = ${datasetId}
    `;
    for (const src of sourcesUsed) {
      await sql`
        INSERT INTO bayanat.asset_request_targets
          (request_id, asset_type_code, asset_id, asset_name)
        VALUES (${reqRow.requestId}, 'DATA_SOURCES', ${src.sourceId}, ${src.sourceName})
        ON CONFLICT DO NOTHING
      `;
    }

    await sql`
      UPDATE bayanat.open_datasets
      SET status_code = 'PENDING_APPROVAL', updated_at = NOW()
      WHERE dataset_id = ${datasetId}
    `;

    await startWorkflow(reqRow.requestId, "PUBLISH_OPEN_DATA", title);

    return NextResponse.json({ ok: true, requestId: reqRow.requestId, status: "PENDING_APPROVAL" });
  }

  // ── Revert to PENDING for modification ───────────────────────────────
  if (action === "revert_to_pending") {
    if (session.role !== "ADMIN" && ds.raisedBy !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (ds.status !== "APPROVED" && ds.status !== "PUBLISHED") {
      return NextResponse.json({ error: "Only APPROVED or PUBLISHED datasets can be reverted" }, { status: 409 });
    }

    await sql`
      UPDATE bayanat.open_datasets SET status_code = 'PENDING', updated_at = NOW() WHERE dataset_id = ${datasetId}
    `;

    return NextResponse.json({ ok: true, status: "PENDING" });
  }

  // ── Admin publish ─────────────────────────────────────────────────────
  if (action === "publish") {
    if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (ds.status !== "APPROVED") return NextResponse.json({ error: "Only APPROVED datasets can be published" }, { status: 409 });

    await sql`
      UPDATE bayanat.open_datasets SET status_code = 'PUBLISHED', updated_at = NOW() WHERE dataset_id = ${datasetId}
    `;

    return NextResponse.json({ ok: true, status: "PUBLISHED" });
  }

  // ── Admin reject ──────────────────────────────────────────────────────
  if (action === "reject") {
    if (session.role !== "ADMIN" && session.role !== "OFFICER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await sql`
      UPDATE bayanat.open_datasets SET status_code = 'REJECTED', updated_at = NOW() WHERE dataset_id = ${datasetId}
    `;

    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
