import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listEntries, createEntry } from "@/lib/queries/gov-registers";

export async function GET(_req: Request, { params }: { params: { registerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listEntries(Number(params.registerId)));
}

export async function POST(req: Request, { params }: { params: { registerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await req.json();
  const id = await createEntry(Number(params.registerId), data, session.userId);
  return NextResponse.json({ entryId: id }, { status: 201 });
}
