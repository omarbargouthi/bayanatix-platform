import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listColumns, addColumn } from "@/lib/queries/gov-registers";

export async function GET(_req: Request, { params }: { params: { registerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listColumns(Number(params.registerId)));
}

export async function POST(req: Request, { params }: { params: { registerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const id = await addColumn(Number(params.registerId), body);
  return NextResponse.json({ columnId: id }, { status: 201 });
}
