import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { upsertAssessment } from "@/lib/queries/gov-compliance";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reqId, levelCode, notes } = await req.json();
  await upsertAssessment(reqId, levelCode, notes ?? null, session.userId);
  return NextResponse.json({ ok: true });
}
