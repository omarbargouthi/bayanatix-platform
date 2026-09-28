import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain } from "@/lib/can";
import { getRegisterHistory } from "@/lib/queries/gov-registers";

export async function GET(_req: Request, { params }: { params: { registerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const history = await getRegisterHistory(Number(params.registerId));
  return NextResponse.json(history);
}
