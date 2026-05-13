import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { searchUsers } from "@/lib/queries/stakeholders";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  if (q.trim().length < 1) return NextResponse.json([]);

  return NextResponse.json(await searchUsers(q));
}
