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

  if (!body.bodyText?.trim()) return NextResponse.json({ error: "bodyText required" }, { status: 400 });

  try {
    await sql`
      INSERT INTO bayanat.foi_communications
        (foi_request_id, direction_code, message_type_code, subject_text, body_text, channel_code, sent_by_user_id)
      VALUES (
        ${id},
        ${body.directionCode ?? 'OUTBOUND'},
        ${body.messageTypeCode ?? 'NOTE'},
        ${body.subjectText?.trim() || null},
        ${body.bodyText.trim()},
        ${body.channelCode ?? 'EMAIL'},
        ${session.userId}
      )
    `;
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[FOI COMMUNICATE]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
