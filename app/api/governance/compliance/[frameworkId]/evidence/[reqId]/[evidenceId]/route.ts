import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import {
  getEvidenceItem, getEvidenceFile, updateEvidenceItem, deleteEvidenceItem, cleanEvidenceLink, logEvidenceChange,
  MAX_EVIDENCE_FILE_BYTES, PREVIEWABLE_TYPES,
} from "@/lib/queries/compliance-evidence";

type Params = { params: { frameworkId: string; reqId: string; evidenceId: string } };

// The stored document. Sent for display in the browser (the preview: <img>, fetched text,
// or a PDF opened in its own tab) only when its type is one the browser displays safely;
// anything else, or ?download=1, is sent as a download.
export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const file = await getEvidenceFile(Number(params.reqId), Number(params.evidenceId));
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";
  const inline = !wantsDownload && PREVIEWABLE_TYPES.has(file.mimeType);
  // RFC 5987 form so names with non-ASCII characters (Arabic file names) survive.
  const asciiName = file.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? (file.mimeType.startsWith("text/") ? `${file.mimeType}; charset=utf-8` : file.mimeType) : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      // The type above is the one we stored from the file extension; the browser must not second-guess it.
      "X-Content-Type-Options": "nosniff",
      // A text file opened directly gets no script and no access to the application,
      // whatever it contains. (Not sent for PDFs: the browser's PDF viewer does not load in a sandbox.)
      ...(inline && file.mimeType.startsWith("text/") ? { "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" } : {}),
      "Cache-Control": "private, no-store",
    },
  });
}

// Edits an item: JSON { title, note, url } changes the details; a multipart form with a
// file (and optionally title and note) replaces the stored document.
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const reqId = Number(params.reqId), evidenceId = Number(params.evidenceId), fwId = Number(params.frameworkId);
  const before = await getEvidenceItem(reqId, evidenceId);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Parameters<typeof updateEvidenceItem>[2] = {};
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
    const url = cleanEvidenceLink(fields.url);
    if (!url) return NextResponse.json({ error: "Enter a link that starts with / (a page in Bayanis) or with http:// or https://." }, { status: 400 });
    patch.url = url;
  }

  const item = await updateEvidenceItem(reqId, evidenceId, patch, session.userId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const describe = (i: { title: string; fileName: string | null; linkUrl: string | null }) => `${i.title} (${i.fileName ?? i.linkUrl ?? ""})`;
  if (describe(before) !== describe(item) || patch.file) {
    await logEvidenceChange(reqId, fwId, describe(before), patch.file ? `${describe(item)} — document replaced` : describe(item), session.userId);
  }
  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const reqId = Number(params.reqId), evidenceId = Number(params.evidenceId);
  const before = await getEvidenceItem(reqId, evidenceId);
  if (!before || !(await deleteEvidenceItem(reqId, evidenceId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await logEvidenceChange(reqId, Number(params.frameworkId), `${before.kind === "FILE" ? "Document" : "Link"}: ${before.title}`, "Removed", session.userId);
  return NextResponse.json({ ok: true });
}
