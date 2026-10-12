import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain, canManageDomain } from "@/lib/can";
import { cleanEvidenceLinkFrom, MAX_EVIDENCE_FILE_BYTES } from "@/lib/queries/compliance-evidence";
import { govDocExists, listGovAttachments, addGovAttachmentFile, addGovAttachmentLink } from "@/lib/queries/gov-framework-attachments";

type Params = { params: { id: string } };

// The attachments of one Governance Framework document (files and links). The files
// themselves are served by [attId]/route.ts.
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const docId = Number(params.id);
  if (!(await govDocExists(docId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ items: await listGovAttachments(docId) });
}

// Adds one item: a file (multipart form: file, optional title and note) or a link
// (JSON: { url, title, note }).
export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const docId = Number(params.id);
  if (!(await govDocExists(docId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file || typeof file === "string" || !file.name) return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "The document is empty." }, { status: 400 });
    if (file.size > MAX_EVIDENCE_FILE_BYTES) return NextResponse.json({ error: "The document is larger than 25 MB." }, { status: 400 });
    const item = await addGovAttachmentFile(docId, {
      title: text(form.get("title"), 300) ?? file.name.slice(0, 300), note: text(form.get("note"), 4000),
      fileName: file.name.slice(0, 500), data: Buffer.from(await file.arrayBuffer()),
    }, session.userId);
    return NextResponse.json({ item }, { status: 201 });
  }

  const body = await req.json().catch(() => null);
  const url = cleanEvidenceLinkFrom(body?.url, req);
  if (!url) return NextResponse.json({ error: "Enter a link that starts with / (a page in Bayanis) or with http:// or https://." }, { status: 400 });
  const item = await addGovAttachmentLink(docId, { title: text(body?.title, 300) ?? url.slice(0, 300), note: text(body?.note, 4000), url }, session.userId);
  return NextResponse.json({ item }, { status: 201 });
}
