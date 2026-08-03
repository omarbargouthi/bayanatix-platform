import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBulkJobFile } from "@/lib/queries/bulk-jobs";

// Downloads audited/role-gated the same as viewing the underlying assets (spec §6) —
// this route requires a session, matching the read-gating used across the catalog.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = Number(params.id);
  if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const file = await getBulkJobFile(jobId);
  if (!file?.fileData) return NextResponse.json({ error: "File not found or already purged" }, { status: 404 });

  return new NextResponse(file.fileData as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file.fileName ?? `export-${jobId}.xlsx`}"`,
    },
  });
}
