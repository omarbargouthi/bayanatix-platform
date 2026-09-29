import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDataPrivacyOfficer } from "@/lib/can";

// Lets the Legal Holds UI decide whether to render delete/restore controls —
// the actual enforcement lives in [holdId]/route.ts's DELETE/PUT handlers,
// this just avoids showing a button that would always 403.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canManageDeletion = session.role === "ADMIN" || await isDataPrivacyOfficer(session);
  return NextResponse.json({ canManageDeletion });
}
