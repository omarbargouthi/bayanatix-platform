import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { breachLawFrameworks } from "@/lib/privacy/breach";

// The breach laws and their compliance frameworks (admin only; Configuration › Privacy &
// Retention). A law is preselected on a new breach while its framework is applicable,
// which is set in Regulation Setup, not here.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ laws: await breachLawFrameworks() });
}
