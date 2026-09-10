import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { getCdeDataQualityConfig, updateCdeDataQualityConfig } from "@/lib/queries/catalog";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = await getCdeDataQualityConfig();
  return NextResponse.json({ config });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: { updates: { dimensionCode: string; weight: number; isEnabled: boolean }[] } = await req.json();
  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    return NextResponse.json({ error: "No updates specified" }, { status: 400 });
  }
  for (const u of body.updates) {
    if (typeof u.dimensionCode !== "string" || typeof u.weight !== "number" || u.weight < 0 || typeof u.isEnabled !== "boolean") {
      return NextResponse.json({ error: "Invalid update entry" }, { status: 400 });
    }
  }

  await updateCdeDataQualityConfig(body.updates, session.userId);
  const config = await getCdeDataQualityConfig();
  return NextResponse.json({ config });
}
