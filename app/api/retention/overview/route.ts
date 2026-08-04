import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRetentionOverview } from "@/lib/queries/retention";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const overview = await getRetentionOverview();
  return NextResponse.json(overview);
}
