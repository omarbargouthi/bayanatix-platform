import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDqResultSamples } from "@/lib/queries/dq";

export async function GET(_: NextRequest, { params }: { params: { resultId: string } }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const samples = await getDqResultSamples(Number(params.resultId));
  return NextResponse.json(samples);
}
