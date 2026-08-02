import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setDefaultProfile } from "@/lib/queries/llm-providers";

// Atomically unsets any other default and sets this one (spec AC5: exactly one default).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profileId = Number(params.id);
  if (!Number.isFinite(profileId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await setDefaultProfile(profileId, session.userId);
  return NextResponse.json({ ok: true });
}
