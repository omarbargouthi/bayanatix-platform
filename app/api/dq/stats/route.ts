import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDqDashboardStats, getDqTrendData } from "@/lib/queries/dq";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [stats, trend] = await Promise.all([
    getDqDashboardStats(),
    getDqTrendData(14),
  ]);
  return NextResponse.json({ stats, trend });
}
