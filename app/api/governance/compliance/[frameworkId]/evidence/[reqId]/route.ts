import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import { sql } from "@/lib/db";
import {
  listEvidenceItems, addEvidenceFile, addEvidenceLink, cleanEvidenceLink, logEvidenceChange, MAX_EVIDENCE_FILE_BYTES,
} from "@/lib/queries/compliance-evidence";

type Params = { params: { frameworkId: string; reqId: string } };

async function requirementInFramework(reqId: number, frameworkId: number): Promise<boolean> {
  if (!Number.isFinite(reqId) || !Number.isFinite(frameworkId)) return false;
  const rows = await sql`SELECT 1 FROM bayanat.gov_compliance_requirements WHERE req_id = ${reqId} AND framework_id = ${frameworkId}`;
  return rows.length > 0;
}

// The evidence items of one requirement (documents and links). The documents themselves
// are served by [evidenceId]/route.ts.
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const reqId = Number(params.reqId);
  if (!(await requirementInFramework(reqId, Number(params.frameworkId)))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ items: await listEvidenceItems(reqId) });
}

// Adds one item: a document (multipart form: file, optional title and note) or a link
// (JSON: { url, title, note }).
export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const reqId = Number(params.reqId), fwId = Number(params.frameworkId);
  if (!(await requirementInFramework(reqId, fwId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file || typeof file === "string" || !file.name) return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "The document is empty." }, { status: 400 });
    if (file.size > MAX_EVIDENCE_FILE_BYTES) return NextResponse.json({ error: "The document is larger than 25 MB." }, { status: 400 });
    const item = await addEvidenceFile(reqId, {
      title: text(form.get("title"), 300) ?? file.name.slice(0, 300), note: text(form.get("note"), 4000),
      fileName: file.name.slice(0, 500), data: Buffer.from(await file.arrayBuffer()),
    }, session.userId);
    await logEvidenceChange(reqId, fwId, null, `Added document: ${item.title}`, session.userId);
    return NextResponse.json({ item }, { status: 201 });
  }

  const body = await req.json().catch(() => null);
  const url = cleanEvidenceLink(body?.url);
  if (!url) return NextResponse.json({ error: "Enter a link that starts with / (a page in Bayanis) or with http:// or https://." }, { status: 400 });
  const item = await addEvidenceLink(reqId, { title: text(body?.title, 300) ?? url.slice(0, 300), note: text(body?.note, 4000), url }, session.userId);
  await logEvidenceChange(reqId, fwId, null, `Added link: ${item.title}`, session.userId);
  return NextResponse.json({ item }, { status: 201 });
}
