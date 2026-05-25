import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getMaturitySelections,
  setMaturitySelection,
  clearAssessmentsAboveLevel,
} from "@/lib/queries/gov-compliance";

export async function GET(
  _req: Request,
  { params }: { params: { frameworkId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sels = await getMaturitySelections(Number(params.frameworkId));
  return NextResponse.json({ selections: sels });
}

export async function POST(
  req: Request,
  { params }: { params: { frameworkId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fwId = Number(params.frameworkId);
  const body = await req.json();
  const { standardCode, selectedLevel, clear } = body;

  if (!standardCode || selectedLevel === undefined) {
    return NextResponse.json({ error: "standardCode and selectedLevel required" }, { status: 400 });
  }

  if (clear) {
    // Only clear levels ABOVE the newly selected level; keep levels <= selectedLevel
    await clearAssessmentsAboveLevel(fwId, standardCode, Number(selectedLevel));
  }
  await setMaturitySelection(fwId, standardCode, Number(selectedLevel), session.userId);
  return NextResponse.json({ ok: true });
}
