import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteAttachment, getAttachmentData } from "@/lib/queries/gov-framework";

export async function GET(_req: Request, { params }: { params: { attId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  await deleteAttachment(Number(params.attId));
  return NextResponse.json({ ok: true });
}
