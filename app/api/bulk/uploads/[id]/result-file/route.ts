import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBulkJobResultFile } from "@/lib/queries/bulk-jobs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = Number(params.id);
  if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const fileData = await getBulkJobResultFile(jobId);
  if (!fileData) return NextResponse.json({ error: "Result not available yet (upload hasn't been committed)" }, { status: 404 });

  return new NextResponse(fileData as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bayanatix-upload-result-${jobId}.xlsx"`,
    },
  });
}
