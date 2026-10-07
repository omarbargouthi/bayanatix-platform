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
  const RANGES: Record<string, [number, number]> = {
    minConfidenceThreshold: [0, 1], nameOnlyMatchWeight: [0, 1], highBandThreshold: [0, 1], mediumBandThreshold: [0, 1],
    nameWeightFactor: [0, 5], valueWeightFactor: [0, 5], checksumWeightFactor: [0, 5],
  };
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (body[key] == null) continue;
    const v = Number(body[key]);
    if (!Number.isFinite(v) || v < min || v > max) return NextResponse.json({ error: `${key} must be between ${min} and ${max}` }, { status: 400 });
    body[key] = v;
  }
  const current = await getSitSettings();
  if ((body.mediumBandThreshold ?? current.mediumBandThreshold) > (body.highBandThreshold ?? current.highBandThreshold)) {
    return NextResponse.json({ error: "The MEDIUM threshold can't be higher than the HIGH threshold" }, { status: 400 });
  }
  await updateSitSettings(body);
  return NextResponse.json(await getSitSettings());
}
