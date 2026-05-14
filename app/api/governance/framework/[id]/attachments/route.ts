import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addAttachment, listAttachments } from "@/lib/queries/gov-framework";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const attachments = await listAttachments(Number(params.id));
  return NextResponse.json(attachments);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const id = await addAttachment({
    docId: Number(params.id),
    fileName: file.name,
    fileSizeBytes: file.size,
    fileMimeType: file.type || undefined,
    fileData: buffer,
    uploadedBy: session.userId,
  });
  return NextResponse.json({ attachmentId: id }, { status: 201 });
}
