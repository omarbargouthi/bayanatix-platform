import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { closeThread, getThreadById } from "@/lib/queries/collaboration";

// Threads are an open discussion feature — anyone can read/post — but closing
// ends it for everyone, so that's restricted to the thread's own author or an
// ADMIN, not any authenticated user.
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threadId = Number(params.id);
  const data = await getThreadById(threadId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.role !== "ADMIN" && data.thread.createdBy !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await closeThread(threadId, session.userId);
  return NextResponse.json({ ok: true });
}
