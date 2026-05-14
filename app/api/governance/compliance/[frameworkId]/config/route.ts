import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getLevelConfig, saveLevelConfig } from "@/lib/queries/gov-compliance";

export async function GET(_req: Request, { params }: { params: { frameworkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = await getLevelConfig(Number(params.frameworkId));
  return NextResponse.json(config);
}

export async function POST(req: Request, { params }: { params: { frameworkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!Array.isArray(body.levels)) return NextResponse.json({ error: "levels array required" }, { status: 400 });
  await saveLevelConfig(Number(params.frameworkId), body.levels);
  return NextResponse.json({ ok: true });
}
