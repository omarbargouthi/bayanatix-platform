import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateKpiDefinition } from "@/lib/queries/reports";

export async function PATCH(req: Request, { params }: { params: { kpiCode: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const targetValue = body?.targetValue === undefined ? undefined : (body.targetValue === null ? null : Number(body.targetValue));
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : undefined;

  await updateKpiDefinition(params.kpiCode, { targetValue, isActive });
  return NextResponse.json({ ok: true });
}
