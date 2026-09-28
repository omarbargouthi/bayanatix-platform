import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain, canManageDomain } from "@/lib/can";
import { deleteAttachment, getAttachmentData } from "@/lib/queries/gov-framework";

export async function GET(_req: Request, { params }: { params: { attId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const row = await getAttachmentData(Number(params.attId));
  if (!row || !row.fileData) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(row.fileData, {
    headers: {
      "Content-Type":        row.fileMimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${row.fileName}"`,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: { attId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteAttachment(Number(params.attId));
  return NextResponse.json({ ok: true });
}
