import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateRequirement } from "@/lib/queries/gov-compliance";

export async function PATCH(
  req: Request,
  { params }: { params: { frameworkId: string; reqId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  await updateRequirement(Number(params.reqId), body);
  return NextResponse.json({ ok: true });
}
