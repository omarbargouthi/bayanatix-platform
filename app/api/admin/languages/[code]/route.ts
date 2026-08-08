import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateLanguage } from "@/lib/queries/languages";

export async function PATCH(req: Request, { params }: { params: { code: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  try {
    await updateLanguage(params.code, {
      languageNameText: body.languageNameText,
      orientationCode: body.orientationCode,
      isEnabled: body.isEnabled,
    }, session.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update language";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
