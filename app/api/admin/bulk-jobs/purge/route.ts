import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { purgeExpiredJobFiles } from "@/lib/queries/bulk-jobs";

// Retention sweep (spec §6, default 90 days) — admin-triggered rather than a
// background cron, since this app has no persistent worker process to run one on
// a schedule. Clears file bytes for expired jobs; the job records themselves stay
// for audit history.
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const purgedCount = await purgeExpiredJobFiles();
  return NextResponse.json({ ok: true, purgedCount });
}
