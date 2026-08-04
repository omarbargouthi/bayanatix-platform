import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRecentExports } from "@/lib/queries/reports";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const exports = await getRecentExports(20);
  return NextResponse.json(exports);
}
