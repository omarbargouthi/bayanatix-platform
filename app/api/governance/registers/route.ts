import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listRegisters, createRegister } from "@/lib/queries/gov-registers";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listRegisters());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name, description } = await req.json();
  const id = await createRegister(name, description ?? null);
  return NextResponse.json({ registerId: id }, { status: 201 });
}
