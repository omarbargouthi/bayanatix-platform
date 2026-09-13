import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBulkJobRejectedFile } from "@/lib/queries/bulk-jobs";

// The rejected-only workbook — same columns as the original upload, filtered to
// just the ERROR rows plus a Reason column. Fix the flagged cells and re-upload
// this file directly through the normal Upload flow.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = Number(params.id);
  if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const fileData = await getBulkJobRejectedFile(jobId);
  if (!fileData) return NextResponse.json({ error: "No rejected records for this upload (or not committed yet / already purged)" }, { status: 404 });

  return new NextResponse(fileData as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bayanatix-upload-rejected-${jobId}.xlsx"`,
    },
  });
}
