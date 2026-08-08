import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { revertToMissing } from "@/lib/queries/translations";

export async function POST(req: Request, { params }: { params: { keyId: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const keyId = Number(params.keyId);
  if (!Number.isFinite(keyId)) return NextResponse.json({ error: "Invalid keyId" }, { status: 400 });

  const { languageCode } = (await req.json().catch(() => ({}))) as { languageCode?: string };
  if (!languageCode) return NextResponse.json({ error: "Missing languageCode" }, { status: 400 });

  await revertToMissing(keyId, languageCode, session.userId);
  return NextResponse.json({ ok: true });
}
