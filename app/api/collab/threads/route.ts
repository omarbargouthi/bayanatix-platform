import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listThreads, createThread } from "@/lib/queries/collaboration";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listThreads());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, body } = await req.json();
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }

  const threadId = await createThread(title.trim(), body.trim(), session.userId, session.fullName);
  return NextResponse.json({ threadId }, { status: 201 });
}
