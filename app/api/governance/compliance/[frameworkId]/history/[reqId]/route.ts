import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRequirementHistory, FIELD_LABELS } from "@/lib/queries/gov-compliance";

export async function GET(
  _req: Request,
  { params }: { params: { frameworkId: string; reqId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reqId = Number(params.reqId);
  if (isNaN(reqId)) return NextResponse.json({ error: "Invalid reqId" }, { status: 400 });

  const history = await getRequirementHistory(reqId);
  const enriched = history.map((h) => ({
    ...h,
    fieldLabel: FIELD_LABELS[h.fieldName] ?? h.fieldName,
  }));

  return NextResponse.json({ history: enriched });
}
