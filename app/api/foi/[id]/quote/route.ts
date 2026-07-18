import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getFoiConfig } from "@/lib/queries/foi";

type Ctx = { params: { id: string } };

// POST — generate and issue quote from current assessment
export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty body */ }

  try {
    const [assessment] = await sql`
      SELECT assessment_id, eligibility_code, estimated_effort_days
      FROM bayanat.foi_assessments WHERE foi_request_id = ${id}
    `;
    if (!assessment) return NextResponse.json({ error: "Assessment not found — assess the request first" }, { status: 400 });

    const config = await getFoiConfig();
    const dailyRate    = Number(body.dailyRateOverride ?? config.foi_daily_rate_sar ?? 2000);
    const validityDays = Number(config.foi_quote_validity_days ?? 30);
    const effortDays   = Number(assessment.estimated_effort_days);

    // ALREADY_PUBLIC = free
    const quotedAmount = assessment.eligibility_code === 'ALREADY_PUBLIC' ? 0 : effortDays * dailyRate;

    const breakdown = {
      effortDays,
      dailyRateSar: dailyRate,
      subtotal:     effortDays * dailyRate,
      total:        quotedAmount,
      note:         body.note ?? null,
    };

    // Expire any previously issued quotes
    await sql`
      UPDATE bayanat.foi_quotes SET status_code = 'EXPIRED'
      WHERE foi_request_id = ${id} AND status_code = 'ISSUED'
    `;

    const [quote] = await sql`
      INSERT INTO bayanat.foi_quotes
        (foi_request_id, assessment_id, daily_rate_sar, quoted_amount,
         breakdown_json, estimated_delivery_days, valid_until_date,
         status_code, issued_by_user_id)
      VALUES (
        ${id},
        ${assessment.assessment_id},
        ${dailyRate},
        ${quotedAmount},
        ${JSON.stringify(breakdown)},
        ${body.estimatedDeliveryDays ?? Math.ceil(effortDays * 2)},
        CURRENT_DATE + (${validityDays} * INTERVAL '1 day'),
        'ISSUED',
        ${session.userId}
      )
      RETURNING quote_id AS "quoteId", quoted_amount AS "quotedAmount"
    `;

    // Update request status
    await sql`
      UPDATE bayanat.foi_requests SET status_code = 'QUOTED', updated_at = NOW()
      WHERE foi_request_id = ${id}
    `;

    // Log outbound quote communication
    await sql`
      INSERT INTO bayanat.foi_communications
        (foi_request_id, direction_code, message_type_code, subject_text, body_text, channel_code, sent_by_user_id)
      VALUES (${id}, 'OUTBOUND', 'QUOTE',
        'Quote for your information request',
        ${'A quote of SAR ' + quotedAmount.toFixed(2) + ' has been issued for your request. Please review and accept or decline via your tracking link.'},
        'EMAIL', ${session.userId})
    `;

    return NextResponse.json({ quoteId: quote.quoteId, quotedAmount: quote.quotedAmount }, { status: 201 });
  } catch (err) {
    console.error("[FOI QUOTE]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

// PATCH — accept or decline quote (officer records requester decision)
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

  const decision: string = body.decision; // 'ACCEPTED' | 'DECLINED'
  if (!['ACCEPTED','DECLINED'].includes(decision)) {
    return NextResponse.json({ error: "decision must be ACCEPTED or DECLINED" }, { status: 400 });
  }

  try {
    const [quote] = await sql`
      SELECT quote_id FROM bayanat.foi_quotes
      WHERE foi_request_id = ${id} AND status_code = 'ISSUED'
    `;
    if (!quote) return NextResponse.json({ error: "No issued quote found" }, { status: 400 });

    await sql`
      UPDATE bayanat.foi_quotes SET
        status_code = ${decision},
        decision_at = NOW(),
        acceptance_evidence_ref = ${body.evidenceRef?.trim() || null}
      WHERE quote_id = ${quote.quote_id}
    `;

    const newStatus = decision === 'ACCEPTED' ? 'QUOTE_ACCEPTED' : 'QUOTE_DECLINED';
    await sql`
      UPDATE bayanat.foi_requests SET
        status_code = ${newStatus},
        closed_at = CASE WHEN ${decision} = 'DECLINED' THEN NOW() ELSE NULL END,
        updated_at = NOW()
      WHERE foi_request_id = ${id}
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[FOI QUOTE PATCH]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
