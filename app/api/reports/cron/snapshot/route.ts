import { NextResponse } from "next/server";
import { getAllReportCodes, captureSnapshot } from "@/lib/queries/reports";

// Vercel Cron (see vercel.json) hits this monthly with an Authorization: Bearer
// header set to CRON_SECRET — this route is inert (and safely 401s) until that env
// var is configured, which only happens once the app is actually deployed to Vercel.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reportCodes = await getAllReportCodes();
  const results = await Promise.all(reportCodes.map((code) => captureSnapshot(code)));
  const totalCaptured = results.reduce((s, r) => s + r.captured, 0);

  return NextResponse.json({ reports: reportCodes.length, totalCaptured });
}
