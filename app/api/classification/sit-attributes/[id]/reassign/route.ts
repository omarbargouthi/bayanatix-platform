import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { reassignSitSuggestion } from "@/lib/queries/sit-classification";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const attributeId = Number(params.id);
  if (!Number.isFinite(attributeId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const glossaryId = Number(body.glossary_id);
  const reason = body.reason as string;
  if (!Number.isFinite(glossaryId)) return NextResponse.json({ error: "glossary_id is required" }, { status: 400 });
  if (!reason?.trim()) return NextResponse.json({ error: "reason is required" }, { status: 400 });

  try {
    await reassignSitSuggestion(attributeId, session.userId, glossaryId, reason);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
