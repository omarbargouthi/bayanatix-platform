import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { applyProposal } from "@/lib/chat/classification-apply";

// POST { columnIds } — applies the chosen changes of the classification proposal stored
// on one of the user's Ask Bayanis answers. Only when an administrator allows it
// (Configuration › Ask Bayanis) and the user may edit metadata; the terms come from the
// stored proposal, not from this request.
export async function POST(req: Request, { params }: { params: { messageId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const messageId = Number(params.messageId);
  const body = await req.json().catch(() => ({}));
  const columnIds = Array.isArray(body.columnIds) ? body.columnIds.map(Number).filter(Number.isInteger) : [];
  if (!Number.isInteger(messageId)) return NextResponse.json({ error: "Invalid message" }, { status: 400 });

  const r = await applyProposal(messageId, columnIds, session);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ applied: r.applied, requestId: r.requestId, proposal: r.proposal });
}
