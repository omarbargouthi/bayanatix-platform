import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { sql } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patternId = Number(params.id);
  if (!Number.isFinite(patternId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { is_enabled_indicator: enabled, pattern_regex_text: regex, notes_text: notes } = body;

  if (regex != null) {
    try { new RegExp(regex); } catch { return NextResponse.json({ error: "pattern_regex_text is not a valid regular expression" }, { status: 400 }); }
  }

  await sql`
    UPDATE bayanat.classification_patterns SET
      is_enabled_indicator = coalesce(${enabled ?? null}, is_enabled_indicator),
      pattern_regex_text   = coalesce(${regex ?? null}, pattern_regex_text),
      notes_text           = CASE WHEN ${notes !== undefined} THEN ${notes ?? null} ELSE notes_text END
    WHERE pattern_id = ${patternId}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patternId = Number(params.id);
  if (!Number.isFinite(patternId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await sql`DELETE FROM bayanat.classification_patterns WHERE pattern_id = ${patternId}`;
  return NextResponse.json({ ok: true });
}
