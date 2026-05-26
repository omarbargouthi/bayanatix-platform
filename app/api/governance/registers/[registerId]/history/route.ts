import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRegisterHistory } from "@/lib/queries/gov-registers";

export async function GET(_req: Request, { params }: { params: { registerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const history = await getRegisterHistory(Number(params.registerId));
  return NextResponse.json(history);
}
