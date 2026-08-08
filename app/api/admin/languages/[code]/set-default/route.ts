import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setDefaultLanguage } from "@/lib/queries/languages";

// Atomically unsets any other default and sets this one, and force-enables it
// (the entity default can't be a disabled language a user can't actually pick).
export async function POST(_req: Request, { params }: { params: { code: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await setDefaultLanguage(params.code, session.userId);
  return NextResponse.json({ ok: true });
}
