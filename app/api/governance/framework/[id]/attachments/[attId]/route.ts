import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain, canManageDomain } from "@/lib/can";
import { storedFileResponse } from "@/lib/attachment-response";
import { cleanEvidenceLinkFrom, MAX_EVIDENCE_FILE_BYTES } from "@/lib/queries/compliance-evidence";
import { getGovAttachment, getGovAttachmentFile, updateGovAttachment, deleteGovAttachment } from "@/lib/queries/gov-framework-attachments";

type Params = { params: { id: string; attId: string } };

// The stored file: shown in the browser when its type allows it, otherwise (or with
// ?download=1) sent as a download — see lib/attachment-response.ts.
export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const file = await getGovAttachmentFile(Number(params.id), Number(params.attId));
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return storedFileResponse(file, new URL(req.url).searchParams.get("download") === "1");
}

// Edits an item: JSON { title, note, url } changes the details; a multipart form with a
// file (and optionally title and note) replaces the stored file.
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const docId = Number(params.id), attId = Number(params.attId);
  const before = await getGovAttachment(docId, attId);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Parameters<typeof updateGovAttachment>[2] = {};
  let fields: { title?: unknown; note?: unknown; url?: unknown };
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    fields = { title: form.get("title") ?? undefined, note: form.get("note") ?? undefined };
    const file = form.get("file") as File | null;
    if (file && typeof file !== "string" && file.name) {
      if (before.kind !== "FILE") return NextResponse.json({ error: "A link cannot be replaced by a document; add the document as a new item." }, { status: 400 });
      if (file.size === 0) return NextResponse.json({ error: "The document is empty." }, { status: 400 });
      if (file.size > MAX_EVIDENCE_FILE_BYTES) return NextResponse.json({ error: "The document is larger than 25 MB." }, { status: 400 });
      patch.file = { fileName: file.name.slice(0, 500), data: Buffer.from(await file.arrayBuffer()) };
    }
  } else {
    fields = (await req.json().catch(() => null)) ?? {};
  }

  if (fields.title !== undefined) {
    const title = typeof fields.title === "string" ? fields.title.trim().slice(0, 300) : "";
    if (!title) return NextResponse.json({ error: "The title cannot be empty." }, { status: 400 });
    patch.title = title;
  }
  if (fields.note !== undefined) patch.note = typeof fields.note === "string" && fields.note.trim() ? fields.note.trim().slice(0, 4000) : null;
  if (fields.url !== undefined && before.kind === "LINK") {
    const url = cleanEvidenceLinkFrom(fields.url, req);
    if (!url) return NextResponse.json({ error: "Enter a link that starts with / (a page in Bayanis) or with http:// or https://." }, { status: 400 });
    patch.url = url;
  }

  const item = await updateGovAttachment(docId, attId, patch, session.userId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await deleteGovAttachment(Number(params.id), Number(params.attId)))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
