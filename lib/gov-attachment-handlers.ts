// The request handlers behind the attachments of a Governance Framework document and of
// a roadmap milestone or deliverable. Both sets of routes
//   /api/governance/framework/[id]/attachments[/attId]
//   /api/governance/framework/[id]/items/[itemId]/attachments[/attId]
// call these with their target, so the two behave the same.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain, canManageDomain } from "@/lib/can";
import { storedFileResponse } from "@/lib/attachment-response";
import { cleanEvidenceLinkFrom, MAX_EVIDENCE_FILE_BYTES } from "@/lib/queries/compliance-evidence";
import {
  attachmentTargetExists, listGovAttachments, addGovAttachmentFile, addGovAttachmentLink,
  getGovAttachment, getGovAttachmentFile, updateGovAttachment, deleteGovAttachment, type AttachmentTarget,
} from "@/lib/queries/gov-framework-attachments";

const BAD_LINK = "Enter a link that starts with / (a page in Bayanis) or with http:// or https://.";

/** The signed-in user, or the response that turns the request away. */
async function allow(write: boolean) {
  const session = await getSession();
  if (!session) return { refuse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const ok = write ? await canManageDomain(session, "GOVERNANCE") : await canAccessDomain(session, "GOVERNANCE");
  if (!ok) return { refuse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function listAttachments(target: AttachmentTarget) {
  const { refuse } = await allow(false);
  if (refuse) return refuse;
  if (!(await attachmentTargetExists(target))) return notFound();
  return NextResponse.json({ items: await listGovAttachments(target) });
}

// Adds one item: a file (multipart form: file, optional title and note) or a link
// (JSON: { url, title, note }).
export async function addAttachment(req: Request, target: AttachmentTarget) {
  const { refuse, session } = await allow(true);
  if (refuse) return refuse;
  if (!(await attachmentTargetExists(target))) return notFound();

  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file || typeof file === "string" || !file.name) return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "The document is empty." }, { status: 400 });
    if (file.size > MAX_EVIDENCE_FILE_BYTES) return NextResponse.json({ error: "The document is larger than 25 MB." }, { status: 400 });
    const item = await addGovAttachmentFile(target, {
      title: text(form.get("title"), 300) ?? file.name.slice(0, 300), note: text(form.get("note"), 4000),
      fileName: file.name.slice(0, 500), data: Buffer.from(await file.arrayBuffer()),
    }, session.userId);
    return NextResponse.json({ item }, { status: 201 });
  }

  const body = await req.json().catch(() => null);
  const url = cleanEvidenceLinkFrom(body?.url, req);
  if (!url) return NextResponse.json({ error: BAD_LINK }, { status: 400 });
  const item = await addGovAttachmentLink(target, { title: text(body?.title, 300) ?? url.slice(0, 300), note: text(body?.note, 4000), url }, session.userId);
  return NextResponse.json({ item }, { status: 201 });
}

// The stored file: shown in the browser when its type allows it, otherwise (or with
// ?download=1) sent as a download — see lib/attachment-response.ts.
export async function serveAttachment(req: Request, target: AttachmentTarget, attId: number) {
  const { refuse } = await allow(false);
  if (refuse) return refuse;
  const file = await getGovAttachmentFile(target, attId);
  if (!file) return notFound();
  return storedFileResponse(file, new URL(req.url).searchParams.get("download") === "1");
}

// Edits an item: JSON { title, note, url } changes the details; a multipart form with a
// file (and optionally title and note) replaces the stored file.
export async function editAttachment(req: Request, target: AttachmentTarget, attId: number) {
  const { refuse, session } = await allow(true);
  if (refuse) return refuse;
  const before = await getGovAttachment(target, attId);
  if (!before) return notFound();

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
    if (!url) return NextResponse.json({ error: BAD_LINK }, { status: 400 });
    patch.url = url;
  }

  const item = await updateGovAttachment(target, attId, patch, session.userId);
  if (!item) return notFound();
  return NextResponse.json({ item });
}

export async function removeAttachment(target: AttachmentTarget, attId: number) {
  const { refuse } = await allow(true);
  if (refuse) return refuse;
  if (!(await deleteGovAttachment(target, attId))) return notFound();
  return NextResponse.json({ ok: true });
}
