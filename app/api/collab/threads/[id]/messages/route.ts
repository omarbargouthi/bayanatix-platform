import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getThreadById, addMessage } from "@/lib/queries/collaboration";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threadId = Number(params.id);
  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const data = await getThreadById(threadId);
  if (!data) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const messageId = await addMessage(
    threadId,
    session.userId,
    session.fullName,
    body.trim(),
    data.thread.title,
  );
  return NextResponse.json({ messageId }, { status: 201 });
}
