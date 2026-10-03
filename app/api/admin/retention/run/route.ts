import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runRetention, runRetentionIfDue } from "@/lib/privacy/retention";

// POST — purge Bayanis's own records past their retention period.
//  * scripts/scheduler.mjs (Authorization: Bearer CRON_SECRET, no session): runs at most once a day.
//  * An administrator (Configuration > Privacy & Retention > Run now): runs immediately.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) {
    return NextResponse.json(await runRetentionIfDue());
  }
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ran: true, result: await runRetention() });
}
