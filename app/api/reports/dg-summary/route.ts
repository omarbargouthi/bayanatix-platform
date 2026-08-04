import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDgSummaryReportData } from "@/lib/queries/reports";
import { applyStewardScope } from "@/lib/reports/access";

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const domainGlossaryId = searchParams.get("domain") ? Number(searchParams.get("domain")) : undefined;
  const sourceId = searchParams.get("source") ? Number(searchParams.get("source")) : undefined;
  const ownerId = searchParams.get("owner") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

  const filters = await applyStewardScope(session, { domainGlossaryId, sourceId, ownerId });
  const data = await getDgSummaryReportData(filters, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  return NextResponse.json(data);
}
