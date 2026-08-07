import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { setFeedback } from "@/lib/queries/chat";

export async function POST(req: Request, { params }: { params: { messageId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const messageId = Number(params.messageId);
  const body = await req.json().catch(() => ({}));
  const feedbackCode = body.feedbackCode;
  if (feedbackCode !== "UP" && feedbackCode !== "DOWN") {
    return NextResponse.json({ error: "feedbackCode must be UP or DOWN" }, { status: 400 });
  }
  const comment = typeof body.comment === "string" && body.comment.trim() ? body.comment.trim() : null;

  const [owner] = await sql<{ userId: string }[]>`
    SELECT c.user_id AS "userId"
    FROM bayanat.chat_messages m JOIN bayanat.chat_conversations c ON c.conversation_id = m.conversation_id
    WHERE m.message_id = ${messageId}
  `;
  if (!owner || owner.userId !== session.userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await setFeedback(messageId, feedbackCode, comment);
  return NextResponse.json({ ok: true });
}
