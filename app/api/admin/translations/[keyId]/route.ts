import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateTranslation } from "@/lib/queries/translations";

export async function PATCH(req: Request, { params }: { params: { keyId: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const keyId = Number(params.keyId);
  if (!Number.isFinite(keyId)) return NextResponse.json({ error: "Invalid keyId" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { languageCode, text } = body as { languageCode?: string; text?: string };
  if (!languageCode || typeof text !== "string") return NextResponse.json({ error: "languageCode and text are required" }, { status: 400 });

  await updateTranslation(keyId, languageCode, text, session.userId);
  return NextResponse.json({ ok: true });
}
