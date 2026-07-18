import { NextResponse } from "next/server";
import { getFoiByToken } from "@/lib/queries/foi";

type Ctx = { params: { token: string } };

// Public endpoint — no auth. Only returns limited, non-PII status information.
export async function GET(_req: Request, { params }: Ctx) {
  const token = params.token?.trim();
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "Invalid tracking token" }, { status: 400 });
  }

  const data = await getFoiByToken(token);
  if (!data) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  return NextResponse.json(data);
}

// Public endpoint — requester accepts or declines the quote via tracking link
export async function PATCH(req: Request, { params }: Ctx) {
  const token = params.token?.trim();
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "Invalid tracking token" }, { status: 400 });
  }

  let body: { decision?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const decision = body.decision;
  if (!['ACCEPTED', 'DECLINED'].includes(decision ?? '')) {
    return NextResponse.json({ error: "decision must be ACCEPTED or DECLINED" }, { status: 400 });
  }

  const { sql } = await import("@/lib/db");

  const [row] = await sql`
    SELECT r.foi_request_id, q.quote_id
    FROM bayanat.foi_requests r
    JOIN bayanat.foi_quotes q ON q.foi_request_id = r.foi_request_id
      AND q.status_code = 'ISSUED'
    WHERE r.access_token = ${token}
    LIMIT 1
  `;

  if (!row) return NextResponse.json({ error: "No active quote found for this request" }, { status: 404 });

  await sql`
    UPDATE bayanat.foi_quotes SET
      status_code = ${decision!},
      decision_at = NOW(),
      acceptance_evidence_ref = 'PORTAL_SELF_SERVICE'
    WHERE quote_id = ${row.quote_id}
  `;

  await sql`
    UPDATE bayanat.foi_requests SET
      status_code = ${decision === 'ACCEPTED' ? 'QUOTE_ACCEPTED' : 'QUOTE_DECLINED'},
      updated_at = NOW()
    WHERE foi_request_id = ${row.foi_request_id}
  `;

  return NextResponse.json({ ok: true });
}
