import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { captureSnapshot } from "@/lib/queries/reports";

const VALID_REPORT_CODES = ["R2_DQ", "R8_DG_SUMMARY"];

export async function POST(_req: Request, { params }: { params: { reportCode: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!VALID_REPORT_CODES.includes(params.reportCode)) {
    return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  }

  const result = await captureSnapshot(params.reportCode);
  return NextResponse.json(result);
}
