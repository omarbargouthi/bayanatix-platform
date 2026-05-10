import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { advanceWorkflow } from "@/lib/workflow";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestId = Number(params.id);
  const { outcome, notes } = await req.json();

  const VALID = ["APPROVED", "REJECTED", "COMPLETED"];
  if (!VALID.includes(outcome))
    return NextResponse.json({ error: "outcome must be APPROVED, REJECTED, or COMPLETED" }, { status: 400 });

  const [req_] = await sql<{ title: string; statusCode: string }[]>`
    SELECT title, status_code AS "statusCode" FROM bayanat.asset_requests WHERE request_id = ${requestId}
  `;
  if (!req_) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  try {
    const result = await advanceWorkflow(requestId, session.userId, req_.title, outcome, notes);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
