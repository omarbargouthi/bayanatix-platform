import { NextResponse } from "next/server";
import { listScheduledJobAreas, markScheduledJobRan } from "@/lib/queries/scheduling";
import { isScheduleDue } from "@/lib/scheduler-utils";
import { getAllReportCodes, captureSnapshot } from "@/lib/queries/reports";
import { captureMaturityTrendSnapshot } from "@/lib/queries/dashboard";
import { captureComplianceTrendSnapshot } from "@/lib/queries/gov-compliance";

// Hit by scripts/scheduler.mjs's poll tick (Authorization: Bearer CRON_SECRET,
// same convention as /api/admin/sources/scheduled-crawl and
// /api/dq/scheduled-run) -- but checks a per-AREA schedule
// (bayanat.scheduled_job_areas) rather than a per-row one, since Reports
// snapshot capture and Regulation trend capture aren't tied to one connection
// or rule. Deliberately separate from crawl/DQ scheduling -- doesn't touch
// either of those tables or routes.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const areas = await listScheduledJobAreas();
  const due = areas.filter((a) => a.isEnabled && isScheduleDue(a.scheduleCron, a.lastRunAt));

  const results: Record<string, unknown> = {};
  for (const area of due) {
    if (area.areaCode === "REPORTS_SNAPSHOT") {
      const reportCodes = await getAllReportCodes();
      const captured = await Promise.all(reportCodes.map((c) => captureSnapshot(c)));
      results[area.areaCode] = { reports: reportCodes.length, totalCaptured: captured.reduce((s, r) => s + r.captured, 0) };
    } else if (area.areaCode === "REGULATION_TREND") {
      // Folds in the pre-existing dashboard-level weighted maturity trend
      // capture too -- both are conceptually the same "Regulation" schedule.
      const maturity = await captureMaturityTrendSnapshot();
      const compliance = await captureComplianceTrendSnapshot();
      results[area.areaCode] = { maturity, compliance };
    }
    await markScheduledJobRan(area.areaCode);
  }

  return NextResponse.json({ candidates: areas.length, due: due.length, results });
}
