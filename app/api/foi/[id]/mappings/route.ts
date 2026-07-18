import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

const BLOCKED_SENSITIVITY = new Set(["CONFIDENTIAL", "RESTRICTED", "SECRET", "TOP_SECRET"]);

function classificationStatusFor(sensitivityCode: string | null | undefined): "PENDING" | "CLEARED" | "BLOCKED" {
  if (!sensitivityCode) return "PENDING";
  return BLOCKED_SENSITIVITY.has(sensitivityCode) ? "BLOCKED" : "CLEARED";
}

// GET — all mappings with joined catalog labels
export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const rows = await sql`
    SELECT
      m.mapping_id              AS "mappingId",
      m.req_attr_id             AS "reqAttrId",
      a.attribute_name_text     AS "requestedAttributeName",
      a.description_text        AS "requestedAttributeDesc",
      a.format_hint_text        AS "requestedFormatHint",
      m.source_type             AS "sourceType",
      m.data_source_id          AS "dataSourceId",
      ds.source_name_text       AS "dataSourceName",
      m.data_entity_id          AS "dataEntityId",
      de.entity_name_text       AS "dataEntityName",
      COALESCE(de.display_name_text, de.entity_name_text) AS "dataEntityDisplayName",
      m.data_attribute_id       AS "dataAttributeId",
      da.physical_name_text     AS "dataAttributeName",
      COALESCE(da.friendly_name_text, da.physical_name_text) AS "dataAttributeDisplayName",
      da.data_type_text         AS "dataType",
      m.manual_system_name      AS "manualSystemName",
      m.manual_entity_name      AS "manualEntityName",
      m.manual_column_name      AS "manualColumnName",
      m.sensitivity_code        AS "sensitivityCode",
      ct.class_name_text        AS "sensitivityLabel",
      m.classification_status   AS "classificationStatus",
      m.classification_notes    AS "classificationNotes",
      m.quality_status          AS "qualityStatus",
      m.quality_notes           AS "qualityNotes",
      m.officer_notes           AS "officerNotes",
      m.updated_at              AS "updatedAt"
    FROM bayanat.foi_attribute_mappings m
    JOIN bayanat.foi_requested_attributes a ON a.req_attr_id = m.req_attr_id
    LEFT JOIN bayanat.data_sources ds ON ds.data_source_id = m.data_source_id
    LEFT JOIN bayanat.data_entities de ON de.entity_id = m.data_entity_id
    LEFT JOIN bayanat.data_attributes da ON da.attribute_id = m.data_attribute_id
    LEFT JOIN bayanat.classification_types ct ON ct.class_code = m.sensitivity_code
    WHERE m.foi_request_id = ${id}
    ORDER BY a.sort_order, m.mapping_id
  `;
  return NextResponse.json(rows);
}

// POST — upsert a single mapping (one per requested attribute, overwrite if exists)
export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reqAttrId = Number(body.reqAttrId);
  if (!Number.isFinite(reqAttrId)) return NextResponse.json({ error: "reqAttrId required" }, { status: 400 });
  if (!["CATALOG","MANUAL"].includes(body.sourceType)) {
    return NextResponse.json({ error: "sourceType must be CATALOG or MANUAL" }, { status: 400 });
  }

  const classStatus = classificationStatusFor(body.sensitivityCode);

  try {
    // Delete existing mapping for this attribute and re-insert
    await sql`DELETE FROM bayanat.foi_attribute_mappings WHERE foi_request_id = ${id} AND req_attr_id = ${reqAttrId}`;

    const [row] = await sql`
      INSERT INTO bayanat.foi_attribute_mappings (
        foi_request_id, req_attr_id, source_type,
        data_source_id, data_entity_id, data_attribute_id,
        manual_system_name, manual_entity_name, manual_column_name,
        sensitivity_code, classification_status, classification_notes,
        quality_status, quality_notes, officer_notes, mapped_by_user_id
      ) VALUES (
        ${id}, ${reqAttrId}, ${body.sourceType},
        ${body.dataSourceId ?? null}, ${body.dataEntityId ?? null}, ${body.dataAttributeId ?? null},
        ${body.manualSystemName?.trim() || null}, ${body.manualEntityName?.trim() || null}, ${body.manualColumnName?.trim() || null},
        ${body.sensitivityCode || null}, ${classStatus}, ${body.classificationNotes?.trim() || null},
        ${'PENDING'}, ${null}, ${body.officerNotes?.trim() || null}, ${session.userId}
      )
      RETURNING mapping_id AS "mappingId", classification_status AS "classificationStatus"
    `;

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("[FOI MAPPINGS POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

// PATCH — run quality check on a catalog-mapped column, or update notes
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.action === "RUN_QUALITY_CHECK") {
      // For each CATALOG mapping with a data_attribute_id, check latest dq_results via dq_rules
      const mappings = await sql`
        SELECT m.mapping_id, m.data_attribute_id
        FROM bayanat.foi_attribute_mappings m
        WHERE m.foi_request_id = ${id} AND m.source_type = 'CATALOG' AND m.data_attribute_id IS NOT NULL
      `;

      for (const m of mappings) {
        // Get the latest DQ result for any rule covering this attribute's entity
        const [dqRow] = await sql`
          SELECT r.status_code, r.failure_percentage_number
          FROM bayanat.dq_results r
          JOIN bayanat.dq_rules ru ON ru.rule_id = r.rule_id
          JOIN bayanat.data_attributes da ON da.entity_id = ru.entity_id
          WHERE da.attribute_id = ${m.data_attribute_id}
          ORDER BY r.execution_timestamp DESC
          LIMIT 1
        `;

        const qStatus = dqRow
          ? (dqRow.status_code === 'PASSED' ? 'CLEARED' : 'FLAGGED')
          : 'CLEARED'; // no DQ rules = no issues
        const qNotes = dqRow
          ? (dqRow.status_code === 'PASSED'
            ? `DQ pass rate: ${100 - Number(dqRow.failure_percentage_number ?? 0)}%`
            : `DQ check failed: ${Number(dqRow.failure_percentage_number ?? 0).toFixed(1)}% failure rate`)
          : 'No DQ rules defined for this column';

        await sql`
          UPDATE bayanat.foi_attribute_mappings SET
            quality_status = ${qStatus}, quality_notes = ${qNotes}, updated_at = NOW()
          WHERE mapping_id = ${m.mapping_id}
        `;
      }

      // Set PENDING mappings without data_attribute_id to CLEARED (manual — no DQ to check)
      await sql`
        UPDATE bayanat.foi_attribute_mappings SET
          quality_status = 'CLEARED', quality_notes = 'Manual source — no automated DQ available', updated_at = NOW()
        WHERE foi_request_id = ${id} AND source_type = 'MANUAL' AND quality_status = 'PENDING'
      `;

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[FOI MAPPINGS PATCH]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

// DELETE — remove a mapping
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  const { searchParams } = new URL(req.url);
  const mappingId = Number(searchParams.get("mappingId"));
  if (!Number.isFinite(mappingId)) return NextResponse.json({ error: "mappingId required" }, { status: 400 });

  await sql`DELETE FROM bayanat.foi_attribute_mappings WHERE mapping_id = ${mappingId} AND foi_request_id = ${id}`;
  return NextResponse.json({ ok: true });
}
