import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSitSettings, updateSitSettings } from "@/lib/queries/sit-classification";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getSitSettings());
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  for (const key of ["minConfidenceThreshold", "nameOnlyMatchWeight"] as const) {
    if (body[key] == null) continue;
    const v = Number(body[key]);
    if (!Number.isFinite(v) || v < 0 || v > 1) return NextResponse.json({ error: `${key} must be between 0 and 1` }, { status: 400 });
    body[key] = v;
  }
  await updateSitSettings(body);
  return NextResponse.json(await getSitSettings());
}
