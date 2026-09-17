import { NextResponse } from "next/server";
import { getSession, signSession, setSessionCookie } from "@/lib/auth";
import { setAvatarColor } from "@/lib/queries/users";
import { AVATAR_COLOR_CODES } from "@/components/ui/Avatar";

// Re-signs the session cookie, matching the pattern used by
// /api/users/me/language — the Header/Sidebar avatar reads colorCode
// straight off the session, no per-request fetch.
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { colorCode } = (await req.json()) as { colorCode?: string | null };
  if (colorCode != null && !AVATAR_COLOR_CODES.includes(colorCode)) {
    return NextResponse.json({ error: "Unknown color preset" }, { status: 400 });
  }

  await setAvatarColor(session.userId, colorCode ?? null);

  const updated = { ...session, avatarColorCode: colorCode ?? null };
  const token = await signSession(updated);
  setSessionCookie(token);

  return NextResponse.json({ ok: true, avatarColorCode: colorCode ?? null });
}
