import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClassificationStats } from "@/lib/queries/catalog";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stats = await getClassificationStats();
  return NextResponse.json(stats);
}
