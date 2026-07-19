import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

const BLOCKED_SENSITIVITY = new Set(["CONFIDENTIAL", "RESTRICTED", "SECRET", "TOP_SECRET"]);

function classificationStatusFor(code: string | null | undefined): "PENDING" | "CLEARED" | "BLOCKED" {
  if (!code) return "PENDING";
  return BLOCKED_SENSITIVITY.has(code) ? "BLOCKED" : "CLEARED";
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
      m.catalog_class_code      AS "catalogClassCode",
      ctc.class_name_text       AS "catalogClassLabel",
      m.classification_status   AS "classificationStatus",
      m.classification_notes    AS "classificationNotes",
      m.quality_status          AS "qualityStatus",
      m.quality_notes           AS "qualityNotes",
      m.officer_notes           AS "officerNotes",
      m.steward_notified_at     AS "stewardNotifiedAt",
      m.steward_notification_notes AS "stewardNotificationNotes",
      m.updated_at              AS "updatedAt"
    FROM bayanat.foi_attribute_mappings m
    JOIN bayanat.foi_requested_attributes a ON a.req_attr_id = m.req_attr_id
    LEFT JOIN bayanat.data_sources ds ON ds.data_source_id = m.data_source_id
    LEFT JOIN bayanat.data_entities de ON de.entity_id = m.data_entity_id
    LEFT JOIN bayanat.data_attributes da ON da.attribute_id = m.data_attribute_id
    LEFT JOIN bayanat.classification_types ct  ON ct.class_code  = m.sensitivity_code
    LEFT JOIN bayanat.classification_types ctc ON ctc.class_code = m.catalog_class_code
    WHERE m.foi_request_id = ${id}
    ORDER BY a.sort_order, m.mapping_id
  `;
  return NextResponse.json(rows);
}

// POST — upsert a single mapping (one per requested attribute)
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

  try {
    // For CATALOG mappings, auto-read classification from the catalog attribute
    let catalogClassCode: string | null = null;
    let resolvedSensitivity: string | null = body.sensitivityCode || null;
    let classNotes: string | null = body.classificationNotes?.trim() || null;

    if (body.sourceType === "CATALOG" && body.dataAttributeId) {
      const [catAttr] = await sql`
        SELECT classification_code FROM bayanat.data_attributes WHERE attribute_id = ${Number(body.dataAttributeId)}
      `;
      catalogClassCode = catAttr?.classification_code ?? null;

      if (!resolvedSensitivity && catalogClassCode) {
        // Officer hasn't manually set sensitivity — use catalog classification
        resolvedSensitivity = catalogClassCode;
      }

      if (!catalogClassCode && !resolvedSensitivity) {
        // Column not classified in catalog and officer hasn't set it
        classNotes = classNotes ?? "Column is not classified in the data catalog. Coordinate with the data steward before proceeding.";
      }
    }

    const classStatus = classificationStatusFor(resolvedSensitivity);

    await sql`DELETE FROM bayanat.foi_attribute_mappings WHERE foi_request_id = ${id} AND req_attr_id = ${reqAttrId}`;

    const [row] = await sql`
      INSERT INTO bayanat.foi_attribute_mappings (
        foi_request_id, req_attr_id, source_type,
        data_source_id, data_entity_id, data_attribute_id,
        manual_system_name, manual_entity_name, manual_column_name,
        sensitivity_code, catalog_class_code, classification_status, classification_notes,
        quality_status, officer_notes, mapped_by_user_id
      ) VALUES (
        ${id}, ${reqAttrId}, ${body.sourceType},
        ${body.dataSourceId ?? null}, ${body.dataEntityId ?? null}, ${body.dataAttributeId ?? null},
        ${body.manualSystemName?.trim() || null}, ${body.manualEntityName?.trim() || null}, ${body.manualColumnName?.trim() || null},
        ${resolvedSensitivity}, ${catalogClassCode}, ${classStatus}, ${classNotes},
        'PENDING', ${body.officerNotes?.trim() || null}, ${session.userId}
      )
      RETURNING mapping_id AS "mappingId",
                classification_status AS "classificationStatus",
                catalog_class_code AS "catalogClassCode",
                sensitivity_code AS "sensitivityCode"
    `;

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("[FOI MAPPINGS POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

// PATCH — quality check or steward notification
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
    // ── Quality check ──────────────────────────────────────────────────────────
    if (body.action === "RUN_QUALITY_CHECK") {
      const mappings = await sql`
        SELECT m.mapping_id, m.data_attribute_id
        FROM bayanat.foi_attribute_mappings m
        WHERE m.foi_request_id = ${id} AND m.source_type = 'CATALOG' AND m.data_attribute_id IS NOT NULL
      `;

      for (const m of mappings) {
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
          : 'CLEARED';
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

      await sql`
        UPDATE bayanat.foi_attribute_mappings SET
          quality_status = 'CLEARED', quality_notes = 'Manual source — no automated DQ available', updated_at = NOW()
        WHERE foi_request_id = ${id} AND source_type = 'MANUAL' AND quality_status = 'PENDING'
      `;

      return NextResponse.json({ ok: true });
    }

    // ── Notify steward ─────────────────────────────────────────────────────────
    if (body.action === "NOTIFY_STEWARD") {
      const mappingId = Number(body.mappingId);
      if (!Number.isFinite(mappingId)) return NextResponse.json({ error: "mappingId required" }, { status: 400 });

      // Fetch mapping details to build the notification
      const [mapping] = await sql`
        SELECT m.mapping_id, m.data_source_id, m.data_entity_id, m.data_attribute_id,
               da.physical_name_text AS attr_name,
               COALESCE(da.friendly_name_text, da.physical_name_text) AS attr_display,
               de.entity_name_text,
               ds.source_name_text,
               a.attribute_name_text AS req_attr_name,
               r.subject_text, r.reference_code
        FROM bayanat.foi_attribute_mappings m
        JOIN bayanat.foi_requested_attributes a ON a.req_attr_id = m.req_attr_id
        JOIN bayanat.foi_requests r ON r.foi_request_id = m.foi_request_id
        LEFT JOIN bayanat.data_attributes da ON da.attribute_id = m.data_attribute_id
        LEFT JOIN bayanat.data_entities de ON de.entity_id = m.data_entity_id
        LEFT JOIN bayanat.data_sources ds ON ds.data_source_id = m.data_source_id
        WHERE m.mapping_id = ${mappingId} AND m.foi_request_id = ${id}
      `;
      if (!mapping) return NextResponse.json({ error: "Mapping not found" }, { status: 404 });

      // Try to find a steward for this data source
      let stewardUserId: string | null = null;
      if (mapping.data_source_id) {
        const [stewardRow] = await sql`
          SELECT user_id FROM bayanat.asset_stakeholders
          WHERE asset_type_code = 'DATA_SOURCE' AND asset_id = ${mapping.data_source_id}
            AND role_code IN ('BIZ_STEWARD', 'TECH_STEWARD')
          ORDER BY role_code
          LIMIT 1
        `;
        stewardUserId = stewardRow?.user_id ?? null;
      }

      const notifMsg = body.message?.trim()
        || `Classification required: column "${mapping.attr_display ?? mapping.attr_name}" in ${mapping.source_name_text ?? "the source system"} (table: ${mapping.entity_name_text ?? "—"}) is unclassified. It is needed to fulfill FOI request ${mapping.reference_code}: "${mapping.subject_text}". Please classify this column so the request can proceed.`;

      // Log as a FOI communication (internal steward coordination)
      await sql`
        INSERT INTO bayanat.foi_communications
          (foi_request_id, direction_code, message_type_code, subject_text, body_text, channel_code, sent_by_user_id)
        VALUES (
          ${id}, 'INTERNAL', 'STEWARD_COORDINATION',
          ${'Classification request: ' + (mapping.attr_display ?? mapping.attr_name ?? 'column')},
          ${notifMsg},
          'INTERNAL',
          ${session.userId}
        )
      `;

      // Mark the mapping as steward-notified
      await sql`
        UPDATE bayanat.foi_attribute_mappings SET
          steward_notified_at = NOW(),
          steward_notification_notes = ${notifMsg},
          updated_at = NOW()
        WHERE mapping_id = ${mappingId}
      `;

      return NextResponse.json({ ok: true, stewardUserId });
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
