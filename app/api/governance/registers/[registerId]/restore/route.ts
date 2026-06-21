import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { restoreRegister } from "@/lib/queries/gov-registers";

export async function POST(_req: Request, { params }: { params: { registerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await restoreRegister(Number(params.registerId));
  return NextResponse.json({ ok: true });
}
