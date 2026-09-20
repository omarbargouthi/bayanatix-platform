import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllSitTerms } from "@/lib/queries/sit-classification";

// Every SIT-flagged term regardless of pattern count — backs the admin pattern
// editor (a newly-flagged term with zero patterns must still be pickable there).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getAllSitTerms());
}
