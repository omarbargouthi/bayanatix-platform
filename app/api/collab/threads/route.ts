import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listThreads, createThread } from "@/lib/queries/collaboration";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await listThreads());
  } catch (err) {
    console.error("[GET /api/collab/threads]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { title, body, threadType } = await req.json();
    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: "title and body are required" }, { status: 400 });
    }
    const type = threadType === "QUESTION" ? "QUESTION" : "DISCUSSION";
    const threadId = await createThread(title.trim(), body.trim(), session.userId, session.fullName, type);
    return NextResponse.json({ threadId }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/collab/threads]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
