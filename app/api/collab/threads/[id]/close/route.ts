import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { closeThread } from "@/lib/queries/collaboration";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await closeThread(Number(params.id), session.userId);
  return NextResponse.json({ ok: true });
}
