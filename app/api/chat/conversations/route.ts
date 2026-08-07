import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createConversation, listConversations } from "@/lib/queries/chat";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listConversations(session.userId));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const contextAssetType = typeof body.contextAssetType === "string" ? body.contextAssetType : null;
  const contextAssetId = typeof body.contextAssetId === "number" ? body.contextAssetId : null;

  const conversationId = await createConversation(session.userId, contextAssetType, contextAssetId);
  return NextResponse.json({ conversationId });
}
