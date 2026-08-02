import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { discardDescriptionSuggestion } from "@/lib/queries/enrichment-descriptions";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const suggestionId = Number(params.id);
  if (!Number.isFinite(suggestionId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await discardDescriptionSuggestion(suggestionId, session.userId);
  return NextResponse.json({ ok: true });
}
