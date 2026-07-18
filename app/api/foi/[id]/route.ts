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
      await sql`
        UPDATE bayanat.foi_requests SET
          status_code = 'IN_FULFILLMENT',
          fulfillment_stage_code = 'OWNER_IDENTIFICATION',
          updated_at = NOW()
        WHERE foi_request_id = ${id}
      `;

    } else if (action === "ADVANCE_STAGE") {
      const STAGES = [
        'OWNER_IDENTIFICATION','OWNER_SCOPE_REVIEW','STEWARD_COORDINATION',
        'TECHNICAL_COMPILATION','OWNER_PACKAGE_APPROVAL','DMO_RELEASE_APPROVAL',
        'PAYMENT_CONFIRMATION','DELIVERY',
      ];
      const [req2] = await sql`SELECT fulfillment_stage_code FROM bayanat.foi_requests WHERE foi_request_id = ${id}`;
      const idx = STAGES.indexOf(req2.fulfillment_stage_code ?? '');
      const nextStage = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
      if (!nextStage) return NextResponse.json({ error: "Already at final stage" }, { status: 400 });
      const newStatus = nextStage === 'DELIVERY' ? 'AWAITING_PAYMENT' : 'IN_FULFILLMENT';
      await sql`
        UPDATE bayanat.foi_requests SET
          fulfillment_stage_code = ${nextStage},
          status_code = ${newStatus},
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
