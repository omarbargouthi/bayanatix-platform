import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConversation, getMessages, deleteConversation } from "@/lib/queries/chat";

// Ownership mismatches return 404, not 403 — consistent with the app's uniform-
// phrasing principle (never confirm that another user's conversation exists).

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = Number(params.id);
  const conversation = await getConversation(conversationId);
  if (!conversation || conversation.userId !== session.userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await getMessages(conversationId);
  return NextResponse.json({ conversation, messages });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = Number(params.id);
  const conversation = await getConversation(conversationId);
  if (!conversation || conversation.userId !== session.userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteConversation(conversationId);
  return NextResponse.json({ ok: true });
}
