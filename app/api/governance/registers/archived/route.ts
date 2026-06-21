import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listDeletedRegisters } from "@/lib/queries/gov-registers";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const registers = await listDeletedRegisters();
  return NextResponse.json(registers);
}
