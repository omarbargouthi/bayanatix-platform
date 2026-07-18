import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

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

  const amount = Number(body.amount);
  if (!Number.isFinite(amount)) return NextResponse.json({ error: "amount required" }, { status: 400 });

  try {
    const [quote] = await sql`
      SELECT quote_id, quoted_amount FROM bayanat.foi_quotes
      WHERE foi_request_id = ${id} AND status_code = 'ACCEPTED'
    `;

    await sql`
      INSERT INTO bayanat.foi_payments
        (foi_request_id, quote_id, payment_type_code, amount,
         payment_reference_text, received_at, notes_text, recorded_by_user_id)
      VALUES (
        ${id},
        ${quote?.quote_id ?? null},
        ${body.paymentTypeCode ?? 'FULFILLMENT_FEE'},
        ${amount},
        ${body.referenceText?.trim() || null},
        ${body.receivedAt ?? null},
        ${body.notes?.trim() || null},
        ${session.userId}
      )
    `;

    // Check if total paid >= quoted amount → auto-advance to AWAITING_PAYMENT resolved
    if (quote) {
      const [totals] = await sql`
        SELECT COALESCE(SUM(amount) FILTER (WHERE payment_type_code = 'FULFILLMENT_FEE'), 0) AS paid
        FROM bayanat.foi_payments
        WHERE foi_request_id = ${id}
      `;
      if (Number(totals.paid) >= Number(quote.quoted_amount)) {
        // Mark request as ready for delivery (officer still does the actual delivery step)
        await sql`
          UPDATE bayanat.foi_requests SET
            fulfillment_stage_code = 'DELIVERY',
            updated_at = NOW()
          WHERE foi_request_id = ${id}
            AND status_code = 'AWAITING_PAYMENT'
        `;
      }
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[FOI PAYMENT]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
