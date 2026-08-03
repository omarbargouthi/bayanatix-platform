import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveSearch, getRecentSearches } from "@/lib/queries/dashboard";

// GET: last 10 recent searches for the header dropdown (spec FR-1.1).
export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const recent = await getRecentSearches(user.userId, 10);
  return NextResponse.json({ recent });
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { query } = await req.json();
  if (typeof query === "string" && query.trim().length >= 2) {
    await saveSearch(user.userId, query.trim()).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
