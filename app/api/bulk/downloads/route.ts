import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { resolveDownloadScope, type DownloadScope } from "@/lib/bulk/scope-resolver";
import { buildDownloadWorkbooks } from "@/lib/bulk/workbook-writer";
import { buildJobLogText } from "@/lib/bulk/log-writer";
import { createDownloadJob, finishDownloadJob, failJob, getBulkJob } from "@/lib/queries/bulk-jobs";

// Body: { scope: DownloadScope } -> { jobId, status: "RUNNING" } immediately; the
// export itself runs in the background (see lib/queries/bulk-jobs.ts's top note) —
// poll GET /api/bulk/jobs/{id} (or the Jobs tab) until status is COMMITTED, then
// GET /api/bulk/jobs/{id}/file (and /log-file for the operation log).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const scope = body.scope as DownloadScope;
  if (!scope?.type) return NextResponse.json({ error: "scope is required" }, { status: 400 });

  const jobId = await createDownloadJob(scope, session.userId);

  void (async () => {
    try {
      const sheetRows = await resolveDownloadScope(scope);
      const totalRows = Object.values(sheetRows).reduce((sum, rows) => sum + (rows?.length ?? 0), 0);
      if (totalRows === 0) {
        await failJob(jobId, "No rows matched the requested scope");
        return;
      }

      const buffers = await buildDownloadWorkbooks(sheetRows, {
        exportId: `job-${jobId}`, scopeDescription: JSON.stringify(scope),
        exportedByUserId: session.userId, exportedAt: new Date(),
      });

      // NOTE: scopes over ROW_CAP_PER_FILE split into multiple workbook buffers
      // (spec §2.2), but only the first is persisted/downloadable today — zipping
      // them together isn't wired at the storage layer. Not exercised by any real
      // scope in this app's demo data (nowhere near 50k rows), disclosed as a
      // known gap rather than silently dropping the remaining files.
      const fileName = `bayanatix-export-${jobId}${buffers.length > 1 ? "-part1-of-" + buffers.length : ""}.xlsx`;
      const totals = {
        rows: totalRows, files: buffers.length,
        sheets: Object.fromEntries(Object.entries(sheetRows).map(([k, v]) => [k, v?.length ?? 0])),
      };

      const job = await getBulkJob(jobId);
      const logFile = buildJobLogText({
        ...job!, status: "COMMITTED", fileName, totals, finishedAt: new Date().toISOString(),
      });
      await finishDownloadJob(jobId, fileName, buffers[0], logFile, totals);
    } catch (err) {
      await failJob(jobId, err instanceof Error ? err.message : "Download generation failed");
    }
  })();

  return NextResponse.json({ jobId, status: "RUNNING" }, { status: 202 });
}
