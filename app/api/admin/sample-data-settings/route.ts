import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSampleDataSettings, updateSampleDataSettings } from "@/lib/sample-data-settings";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getSampleDataSettings());
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const count = Number(body.sampleRecordCount);
  if (!Number.isFinite(count) || count <= 0)
    return NextResponse.json({ error: "sampleRecordCount must be a positive number" }, { status: 400 });

  await updateSampleDataSettings({ sampleRecordCount: count });
  return NextResponse.json(await getSampleDataSettings());
}
