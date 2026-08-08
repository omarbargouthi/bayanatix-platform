import { NextResponse } from "next/server";
import { getSession, signSession, setSessionCookie } from "@/lib/auth";
import { getLanguageByCode } from "@/lib/queries/languages";
import { setPreferredLanguage } from "@/lib/queries/users";

/** Cross-device language persistence (AC-3) — the session cookie carries preferredLanguageCode, so it must be re-signed here or the change won't be visible until next login. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { languageCode } = (await req.json()) as { languageCode?: string };
  if (!languageCode) return NextResponse.json({ error: "Missing languageCode" }, { status: 400 });

  const lang = await getLanguageByCode(languageCode);
  if (!lang || !lang.isEnabled) return NextResponse.json({ error: "Unknown or disabled language" }, { status: 400 });

  await setPreferredLanguage(session.userId, languageCode);

  const updated = { ...session, preferredLanguageCode: languageCode };
  const token = await signSession(updated);
  setSessionCookie(token);

  return NextResponse.json({ ok: true, preferredLanguageCode: languageCode });
}
