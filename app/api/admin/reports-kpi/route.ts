import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllKpiDefinitions, createCustomKpiDefinition } from "@/lib/queries/reports";
import { validateKpiSql } from "@/lib/reports/kpi-sandbox";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const defs = await getAllKpiDefinitions();
  return NextResponse.json(defs);
}

const VALID_REPORT_CODES = [
  "R1_MCM", "R2_DQ", "R3_DC", "R4_DSI", "R5_OD", "R6_FOI", "R7_PDP", "R8_DG_SUMMARY", "R9_RETENTION",
];
const VALID_FORMATS = ["PERCENT", "NUMBER", "DAYS"];
const VALID_DIRECTIONS = ["UP", "DOWN"];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { kpiCode, reportCode, nameEn, nameAr, capabilityCode, customSql, targetValue, direction, format } = body ?? {};

  if (!kpiCode || typeof kpiCode !== "string" || !/^[A-Z0-9_]+$/.test(kpiCode)) {
    return NextResponse.json({ error: "kpiCode must be uppercase letters/numbers/underscores" }, { status: 400 });
  }
  if (!VALID_REPORT_CODES.includes(reportCode)) return NextResponse.json({ error: "Invalid reportCode" }, { status: 400 });
  if (!nameEn?.trim()) return NextResponse.json({ error: "nameEn is required" }, { status: 400 });
  if (!VALID_DIRECTIONS.includes(direction)) return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  if (!VALID_FORMATS.includes(format)) return NextResponse.json({ error: "Invalid format" }, { status: 400 });

  const validation = validateKpiSql(customSql ?? "");
  if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 400 });

  try {
    await createCustomKpiDefinition({
      kpiCode, reportCode, nameEn: nameEn.trim(), nameAr: nameAr?.trim() || null, capabilityCode: capabilityCode || reportCode,
      customSql, targetValue: targetValue != null ? Number(targetValue) : null, direction, format,
      createdByUserId: session.userId,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create KPI" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
