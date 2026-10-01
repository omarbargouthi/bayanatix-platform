import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateKpiSql } from "@/lib/reports/kpi-sql-assist";

// Drafts a candidate SQL query for a custom KPI from a plain-English
// description -- never executes anything, just returns text for the admin to
// review/edit in the existing Test Query step before saving.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reportCode = typeof body.reportCode === "string" ? body.reportCode : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!reportCode || !description) {
    return NextResponse.json({ error: "reportCode and description are required" }, { status: 400 });
  }

  const result = await generateKpiSql(reportCode, description);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ sql: result.sql });
}
