import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runCustomKpiSql } from "@/lib/reports/kpi-sandbox";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { sql: customSql } = await req.json();
  if (!customSql || typeof customSql !== "string") {
    return NextResponse.json({ error: "sql is required" }, { status: 400 });
  }

  const result = await runCustomKpiSql(customSql);
  return NextResponse.json(result);
}
