import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConfigItems, upsertConfigItem, deleteConfigItem } from "@/lib/queries/gov-compliance";

export async function GET(
  _req: Request,
  { params }: { params: { frameworkId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await getConfigItems(Number(params.frameworkId));
  return NextResponse.json({ items });
}

export async function POST(
  req: Request,
  { params }: { params: { frameworkId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.configGroup || !body.code || !body.label) {
    return NextResponse.json({ error: "configGroup, code, and label are required" }, { status: 400 });
  }
  await upsertConfigItem(Number(params.frameworkId), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: { frameworkId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.configGroup || !body.code) {
    return NextResponse.json({ error: "configGroup and code are required" }, { status: 400 });
  }
  await deleteConfigItem(Number(params.frameworkId), body.configGroup, body.code);
  return NextResponse.json({ ok: true });
}
