import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDpiaReviewer } from "@/lib/privacy/dpia";
import { runDpiaWatch } from "@/lib/privacy/dpia-watch";

// POST — runs the daily check now: suggestions, changes since decisions, reminders.
// The scheduler runs the same check as the DPIA_WATCH area (/api/admin/scheduled-jobs/run).
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDpiaReviewer(session.role)) return NextResponse.json({ error: "Forbidden — admin or data protection officer only", code: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json(await runDpiaWatch());
}
