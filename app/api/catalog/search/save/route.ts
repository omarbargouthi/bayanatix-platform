import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveSearch } from "@/lib/queries/dashboard";

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { query } = await req.json();
  if (typeof query === "string" && query.trim().length >= 2) {
    await saveSearch(user.userId, query.trim()).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
