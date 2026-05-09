import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { addMessage } from "@/lib/queries/collaboration";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const threadId = Number(params.id);
    if (isNaN(threadId)) return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });

    const { body } = await req.json();
    if (!body?.trim()) return NextResponse.json({ error: "body is required" }, { status: 400 });

    // Fetch thread title only — avoids re-fetching all messages
    const threadRows = await sql<{ thread_id: number; title: string }[]>`
      SELECT thread_id, title FROM bayanat.collab_threads WHERE thread_id = ${threadId}
    `;
    if (!threadRows[0]) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

    const messageId = await addMessage(
      threadId,
      session.userId,
      session.fullName,
      body.trim(),
      threadRows[0].title,
    );
    return NextResponse.json({ messageId }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/collab/threads/[id]/messages]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
