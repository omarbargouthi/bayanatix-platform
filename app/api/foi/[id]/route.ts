import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getFoiCase, getFoiCommunications, getFoiPayments } from "@/lib/queries/foi";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [caseDetail, comms, payments] = await Promise.all([
    getFoiCase(id),
    getFoiCommunications(id),
    getFoiPayments(id),
  ]);

  if (!caseDetail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ case: caseDetail, comms, payments });
}

// PATCH — status transitions and field updates
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

  const [cur] = await sql`SELECT status_code FROM bayanat.foi_requests WHERE foi_request_id = ${id}`;
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const action: string = body.action ?? "UPDATE";

  try {
    if (action === "ASSIGN") {
      await sql`
        UPDATE bayanat.foi_requests SET
          assigned_officer_user_id = ${body.officerUserId},
          status_code = CASE WHEN status_code = 'SUBMITTED' THEN 'TRIAGE' ELSE status_code END,
          updated_at = NOW()
        WHERE foi_request_id = ${id}
      `;

    } else if (action === "CLARIFY") {
      // Pause the SLA clock
      await sql`
        UPDATE bayanat.foi_requests SET
          status_code = 'CLARIFICATION_REQUESTED',
          clock_paused_since = NOW(),
          updated_at = NOW()
        WHERE foi_request_id = ${id}
      `;
      await sql`
        INSERT INTO bayanat.foi_communications
          (foi_request_id, direction_code, message_type_code, subject_text, body_text, channel_code, sent_by_user_id)
        VALUES (${id}, 'OUTBOUND', 'CLARIFICATION_REQUEST', ${body.subject ?? 'Clarification required'}, ${body.message}, 'EMAIL', ${session.userId})
      `;

    } else if (action === "RESUME_FROM_CLARIFICATION") {
      // Resume clock: add paused days to counter
      await sql`
        UPDATE bayanat.foi_requests SET
          status_code = 'TRIAGE',
          clock_paused_days = clock_paused_days +
            CASE WHEN clock_paused_since IS NOT NULL
              THEN GREATEST(0, bayanat.ksa_business_days(clock_paused_since::DATE, CURRENT_DATE))
              ELSE 0
            END,
          clock_paused_since = NULL,
          updated_at = NOW()
        WHERE foi_request_id = ${id}
      `;

    } else if (action === "REJECT") {
      if (!body.groundCode) return NextResponse.json({ error: "groundCode required" }, { status: 400 });
      if (!body.justification?.trim()) return NextResponse.json({ error: "justification required" }, { status: 400 });
      await sql`
        UPDATE bayanat.foi_requests SET
          status_code = 'REJECTED',
          rejection_ground_code = ${body.groundCode},
          rejection_justification_text = ${body.justification.trim()},
          closed_at = NOW(),
          updated_at = NOW()
        WHERE foi_request_id = ${id}
      `;
      await sql`
        INSERT INTO bayanat.foi_communications
          (foi_request_id, direction_code, message_type_code, subject_text, body_text, channel_code, sent_by_user_id)
        VALUES (${id}, 'OUTBOUND', 'REJECTION',
          'Information request rejected',
          ${body.justification.trim()},
          'EMAIL', ${session.userId})
      `;

    } else if (action === "PROCEED_TO_ASSESSMENT") {
      await sql`
        UPDATE bayanat.foi_requests SET
          status_code = 'ASSESSMENT',
          updated_at = NOW()
        WHERE foi_request_id = ${id}
      `;

    } else if (action === "ANSWER_FREE") {
      // ALREADY_PUBLIC: answer with link, close
      await sql`
        UPDATE bayanat.foi_requests SET
          status_code = 'DELIVERED',
          delivery_reference = ${body.publicLink ?? null},
          closed_at = NOW(),
          updated_at = NOW()
        WHERE foi_request_id = ${id}
      `;
      await sql`
        INSERT INTO bayanat.foi_communications
          (foi_request_id, direction_code, message_type_code, subject_text, body_text, channel_code, sent_by_user_id)
        VALUES (${id}, 'OUTBOUND', 'DELIVERY',
          'Your information is already publicly available',
          ${body.message ?? ('This information is publicly available at: ' + (body.publicLink ?? ''))},
          'EMAIL', ${session.userId})
      `;

    } else if (action === "START_FULFILLMENT") {
      // Gate: must have paid in full (unless exempt or free)
      const [asmRow] = await sql`SELECT payment_exempt FROM bayanat.foi_assessments WHERE foi_request_id = ${id}`;
      const [qRow] = await sql`SELECT quoted_amount FROM bayanat.foi_quotes WHERE foi_request_id = ${id} AND status_code = 'ACCEPTED'`;
      const quotedAmt = Number(qRow?.quoted_amount ?? 0);
      if (quotedAmt > 0 && !asmRow?.payment_exempt) {
        const [paidRow] = await sql`
          SELECT COALESCE(SUM(CASE WHEN payment_type_code = 'REFUND' THEN -amount ELSE amount END), 0) AS total
          FROM bayanat.foi_payments WHERE foi_request_id = ${id}
        `;
        if (Number(paidRow.total) < quotedAmt) {
          return NextResponse.json({ error: "Payment in full required before fulfillment can start" }, { status: 400 });
        }
      }
      await sql`
        UPDATE bayanat.foi_requests SET
          status_code = 'IN_FULFILLMENT',
          fulfillment_stage_code = 'OWNER_IDENTIFICATION',
          updated_at = NOW()
        WHERE foi_request_id = ${id}
      `;

    } else if (action === "ADVANCE_STAGE") {
      const STAGES = [
        'OWNER_IDENTIFICATION','SOURCE_MAPPING','CLASSIFICATION_GATE',
        'QUALITY_GATE','TECHNICAL_COMPILATION','OWNER_PACKAGE_APPROVAL',
        'DMO_RELEASE_APPROVAL','DELIVERY',
      ];
      const [req2] = await sql`SELECT fulfillment_stage_code FROM bayanat.foi_requests WHERE foi_request_id = ${id}`;
      const currentStage = req2.fulfillment_stage_code ?? '';
      const idx = STAGES.indexOf(currentStage);
      const nextStage = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
      if (!nextStage) return NextResponse.json({ error: "Already at final stage" }, { status: 400 });

      // Gate: SOURCE_MAPPING → CLASSIFICATION_GATE: check all attributes have mappings
      if (currentStage === 'SOURCE_MAPPING') {
        const [unmapped] = await sql`
          SELECT COUNT(*) AS cnt
          FROM bayanat.foi_requested_attributes ra
          WHERE ra.foi_request_id = ${id}
            AND NOT EXISTS (
              SELECT 1 FROM bayanat.foi_attribute_mappings m WHERE m.req_attr_id = ra.req_attr_id
            )
        `;
        if (Number(unmapped.cnt) > 0) {
          return NextResponse.json({ error: `${unmapped.cnt} attribute(s) still unmapped. Map all requested attributes before proceeding.` }, { status: 400 });
        }
      }

      // Gate: CLASSIFICATION_GATE → QUALITY_GATE: block if any mapping is BLOCKED
      if (currentStage === 'CLASSIFICATION_GATE') {
        const [blocked] = await sql`
          SELECT COUNT(*) AS cnt FROM bayanat.foi_attribute_mappings
          WHERE foi_request_id = ${id} AND classification_status = 'BLOCKED'
        `;
        if (Number(blocked.cnt) > 0) {
          return NextResponse.json({ error: `${blocked.cnt} column(s) are classified CONFIDENTIAL or higher. Remove or replace those mappings before proceeding.` }, { status: 400 });
        }
      }

      // At QUALITY_GATE → TECHNICAL_COMPILATION: officer must choose delivery type
      if (currentStage === 'QUALITY_GATE') {
        const deliveryType: string = body.deliveryType;
        if (!['OPEN_DATA','ONE_OFF'].includes(deliveryType)) {
          return NextResponse.json({ error: "deliveryType is required: OPEN_DATA or ONE_OFF" }, { status: 400 });
        }

        const [foiRow] = await sql`
          SELECT r.reference_code, r.subject_text, r.domain_code, r.linked_open_dataset_id
          FROM bayanat.foi_requests r WHERE r.foi_request_id = ${id}
        `;

        // Save delivery type on the FOI request
        await sql`
          UPDATE bayanat.foi_requests SET foi_delivery_type = ${deliveryType}, updated_at = NOW()
          WHERE foi_request_id = ${id}
        `;

        if (!foiRow.linked_open_dataset_id) {
          // Fetch ALL mappings (CATALOG + MANUAL), ordered by mapping_id
          const allMappings = await sql`
            SELECT
              m.mapping_id,
              m.source_type,
              m.data_attribute_id,
              COALESCE(da.friendly_name_text, da.physical_name_text)  AS catalog_col_name,
              m.manual_system_name,
              m.manual_entity_name,
              m.manual_column_name,
              m.officer_notes,
              ROW_NUMBER() OVER (ORDER BY m.mapping_id) AS rn
            FROM bayanat.foi_attribute_mappings m
            LEFT JOIN bayanat.data_attributes da ON da.attribute_id = m.data_attribute_id
            WHERE m.foi_request_id = ${id}
            ORDER BY m.mapping_id
          `;

          if (allMappings.length > 0) {
            // Category 101 = "FOI One-off Records" (from migration 057)
            const categoryId = deliveryType === 'ONE_OFF' ? 101 : null;
            const purposeText = deliveryType === 'ONE_OFF'
              ? 'One-off FOI delivery — for record and audit purposes only; not published to open data portal'
              : 'Open dataset created from FOI request — available for public reuse';
            const datasetName = (body.datasetName?.trim()) || (foiRow.reference_code + ': ' + foiRow.subject_text);
            const datasetDesc  = (body.datasetDescription?.trim()) || (
              deliveryType === 'ONE_OFF'
                ? `One-off data delivery for FOI request ${foiRow.reference_code}: "${foiRow.subject_text}". Retained for audit and traceability; not published to the open data portal.`
                : `Open dataset created from Freedom of Information request ${foiRow.reference_code}: "${foiRow.subject_text}".`
            );

            const [ds] = await sql`
              INSERT INTO bayanat.open_datasets
                (dataset_name_text, description_text, domain_code, purpose_text,
                 category_id, foi_request_id, status_code, raised_by_user_id)
              VALUES (
                ${datasetName},
                ${datasetDesc},
                ${foiRow.domain_code ?? null},
                ${purposeText},
                ${categoryId},
                ${id},
                'DRAFT',
                ${session.userId}
              )
              RETURNING dataset_id AS "datasetId"
            `;

            let sortOrder = 1;
            for (const m of allMappings) {
              if (m.source_type === 'CATALOG' && m.data_attribute_id) {
                // Catalog-mapped column: link by attribute_id. Two distinct requested
                // attributes can legitimately map to the same catalog column, so every
                // mapping gets its own row here — nothing should be silently dropped.
                await sql`
                  INSERT INTO bayanat.open_dataset_columns
                    (dataset_id, attribute_id, publish_name, publish_desc, sort_order)
                  VALUES (${ds.datasetId}, ${m.data_attribute_id}, ${m.catalog_col_name}, ${m.officer_notes ?? null}, ${sortOrder})
                `;
              } else {
                // Manual source: store description text, no attribute_id
                const manualLabel = [m.manual_system_name, m.manual_entity_name, m.manual_column_name].filter(Boolean).join(' › ');
                await sql`
                  INSERT INTO bayanat.open_dataset_columns
                    (dataset_id, attribute_id, manual_source_text, publish_name, publish_desc, sort_order)
                  VALUES (${ds.datasetId}, NULL, ${manualLabel || 'Manual source'}, ${m.manual_column_name ?? 'Column'}, ${m.officer_notes ?? null}, ${sortOrder})
                `;
              }
              sortOrder++;
            }

            await sql`
              UPDATE bayanat.foi_requests SET linked_open_dataset_id = ${ds.datasetId}, updated_at = NOW()
              WHERE foi_request_id = ${id}
            `;
          }
        }
      }

      // Gate: TECHNICAL_COMPILATION → OWNER_PACKAGE_APPROVAL: the linked open data
      // record must be fully processed (submitted past DRAFT/PENDING) before the
      // package can move on for owner review.
      if (currentStage === 'TECHNICAL_COMPILATION') {
        const [dsRow] = await sql`
          SELECT d.status_code AS "statusCode", d.dataset_name_text AS "datasetName"
          FROM bayanat.foi_requests r
          JOIN bayanat.open_datasets d ON d.dataset_id = r.linked_open_dataset_id
          WHERE r.foi_request_id = ${id}
        `;
        const PROCESSED_STATUSES = new Set(['PENDING_APPROVAL', 'APPROVED', 'PUBLISHED']);
        if (!dsRow) {
          return NextResponse.json({ error: "No open data record is linked to this request yet. Complete Quality Gate first." }, { status: 400 });
        }
        if (!PROCESSED_STATUSES.has(dsRow.statusCode)) {
          return NextResponse.json({
            error: `"${dsRow.datasetName}" is not fully processed yet (status: ${dsRow.statusCode}). Open the linked Open Data record, complete its details and columns, and submit it for approval before advancing.`,
          }, { status: 400 });
        }
      }

      await sql`
        UPDATE bayanat.foi_requests SET
          fulfillment_stage_code = ${nextStage},
          status_code = 'IN_FULFILLMENT',
          updated_at = NOW()
        WHERE foi_request_id = ${id}
      `;

    } else if (action === "DELIVER") {
      if (!body.deliveryReference?.trim()) return NextResponse.json({ error: "deliveryReference required" }, { status: 400 });
      await sql`
        UPDATE bayanat.foi_requests SET
          status_code = 'DELIVERED',
          fulfillment_stage_code = 'DELIVERY',
          delivery_reference = ${body.deliveryReference.trim()},
          closed_at = NOW(),
          updated_at = NOW()
        WHERE foi_request_id = ${id}
      `;
      await sql`
        INSERT INTO bayanat.foi_communications
          (foi_request_id, direction_code, message_type_code, subject_text, body_text, channel_code, sent_by_user_id)
        VALUES (${id}, 'OUTBOUND', 'DELIVERY',
          'Your information request has been fulfilled',
          ${body.message ?? ('Your requested information has been delivered. Reference: ' + body.deliveryReference.trim())},
          'EMAIL', ${session.userId})
      `;

    } else if (action === "WITHDRAW") {
      await sql`
        UPDATE bayanat.foi_requests SET
          status_code = 'WITHDRAWN',
          closed_at = NOW(),
          updated_at = NOW()
        WHERE foi_request_id = ${id}
      `;

    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[FOI PATCH]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

// DELETE — permanently remove an FOI request (only if not yet in fulfillment)
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [row] = await sql`
    SELECT status_code, reference_code FROM bayanat.foi_requests WHERE foi_request_id = ${id}
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const UNDELETABLE = new Set(["IN_FULFILLMENT", "DELIVERED", "APPEAL_OPEN"]);
  if (UNDELETABLE.has(row.status_code)) {
    return NextResponse.json({
      error: `Cannot delete ${row.reference_code}: the request is ${row.status_code.replace(/_/g, " ").toLowerCase()}. Close or withdraw it first.`,
    }, { status: 400 });
  }

  // Cascade deletes handle related records (communications, mappings, attributes, etc.)
  await sql`DELETE FROM bayanat.foi_requests WHERE foi_request_id = ${id}`;
  return NextResponse.json({ ok: true });
}
