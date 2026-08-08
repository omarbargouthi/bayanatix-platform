import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getLanguagePolicy, updateLanguagePolicy } from "@/lib/queries/languages";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getLanguagePolicy());
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  await updateLanguagePolicy({
    selfSelectionEnabled: body.selfSelectionEnabled,
    choosableCodes: body.choosableCodes,
    coverageThresholdPct: body.coverageThresholdPct,
  }, session.userId);
  return NextResponse.json({ ok: true });
}
