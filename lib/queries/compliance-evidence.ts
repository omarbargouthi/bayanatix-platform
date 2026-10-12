// Evidence attached to a compliance requirement (db/171): any number of items, each a
// stored document or a link, with a title and a note that can be edited afterwards.
import { sql } from "../db";

export type EvidenceKind = "FILE" | "LINK";
export type EvidenceItem = {
  evidenceId: number; reqId: number; kind: EvidenceKind; title: string; note: string | null;
  fileName: string | null; mimeType: string | null; fileSize: number | null; linkUrl: string | null;
  addedBy: string | null; addedAt: string; updatedBy: string | null; updatedAt: string | null;
  /** Whether the document can be previewed in the page (see canPreviewType). */
  canPreview: boolean;
};

export const MAX_EVIDENCE_FILE_BYTES = 25 * 1024 * 1024;

// Types the browser can show on its own and that cannot run script in our origin.
// HTML and SVG are deliberately absent: served inline they would execute as the app.
export const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain", "text/csv"]);

// Word and PowerPoint (.docx, .pptx) are previewed too, but never displayed by the
// browser itself: the preview fetches the bytes and draws them with script
// (components/governance/DocxPreview.tsx, PptxPreview.tsx). The older binary formats
// (.doc, .ppt) are not: they are downloaded.
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const canPreviewType = (mimeType: string | null | undefined): boolean =>
  !!mimeType && (INLINE_TYPES.has(mimeType) || mimeType === DOCX_TYPE || mimeType === PPTX_TYPE);

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  txt: "text/plain", csv: "text/csv", log: "text/plain", md: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/**
 * cleanEvidenceLink() for a link typed into the application: a full address of this
 * same site (copied from the address bar) is stored as the page path, so the link keeps
 * working when the application is reached under another host name (localhost today, the
 * hosted address tomorrow).
 */
export function cleanEvidenceLinkFrom(raw: unknown, req: Request): string | null {
  const url = cleanEvidenceLink(raw);
  if (!url || url.startsWith("/")) return url;
  try {
    const u = new URL(url);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const sameSite = [req.headers.get("origin"), host ? `http://${host}` : null, host ? `https://${host}` : null].some((o) => o === u.origin);
    return sameSite ? (u.pathname + u.search + u.hash) : url;
  } catch { return url; }
}

/** The type to store for an upload. The extension decides; the browser's claim is not trusted. */
export function evidenceMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return TYPE_BY_EXTENSION[ext] ?? "application/octet-stream";
}

/**
 * A link is either a page inside Bayanis ("/catalog/12/tables/34") or an http(s) address
 * (an intranet page, a document in another system). Returns the cleaned link or null.
 */
export function cleanEvidenceLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url || url.length > 2000) return null;
  if (url.startsWith("/")) return url.startsWith("//") ? null : url;
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
}

const COLUMNS = sql`
  evidence_id AS "evidenceId", req_id AS "reqId", kind_code AS kind, title_text AS title, note_text AS note,
  file_name AS "fileName", mime_type AS "mimeType", file_size AS "fileSize", link_url AS "linkUrl",
  added_by_user_id AS "addedBy", added_at::text AS "addedAt", updated_by_user_id AS "updatedBy", updated_at::text AS "updatedAt"
`;
type Row = Omit<EvidenceItem, "canPreview">;
const shape = (r: Row): EvidenceItem => ({ ...r, canPreview: r.kind === "FILE" && canPreviewType(r.mimeType) });

export async function listEvidenceItems(reqId: number): Promise<EvidenceItem[]> {
  const rows = await sql<Row[]>`SELECT ${COLUMNS} FROM bayanat.gov_compliance_evidence_items WHERE req_id = ${reqId} ORDER BY evidence_id`;
  return rows.map(shape);
}

export async function getEvidenceItem(reqId: number, evidenceId: number): Promise<EvidenceItem | null> {
  const rows = await sql<Row[]>`SELECT ${COLUMNS} FROM bayanat.gov_compliance_evidence_items WHERE req_id = ${reqId} AND evidence_id = ${evidenceId}`;
  return rows[0] ? shape(rows[0]) : null;
}

export async function getEvidenceFile(reqId: number, evidenceId: number): Promise<{ fileName: string; mimeType: string; data: Buffer } | null> {
  const [row] = await sql<{ fileName: string; mimeType: string | null; data: Buffer | null }[]>`
    SELECT file_name AS "fileName", mime_type AS "mimeType", file_data AS data
    FROM bayanat.gov_compliance_evidence_items WHERE req_id = ${reqId} AND evidence_id = ${evidenceId} AND kind_code = 'FILE'
  `;
  if (!row?.data) return null;
  return { fileName: row.fileName, mimeType: row.mimeType ?? "application/octet-stream", data: row.data };
}

export async function addEvidenceFile(reqId: number, f: { title: string; note: string | null; fileName: string; data: Buffer }, userId: string): Promise<EvidenceItem> {
  const [row] = await sql<Row[]>`
    INSERT INTO bayanat.gov_compliance_evidence_items (req_id, kind_code, title_text, note_text, file_name, mime_type, file_size, file_data, added_by_user_id)
    VALUES (${reqId}, 'FILE', ${f.title}, ${f.note}, ${f.fileName}, ${evidenceMimeType(f.fileName)}, ${f.data.length}, ${f.data}, ${userId})
    RETURNING ${COLUMNS}
  `;
  return shape(row);
}

export async function addEvidenceLink(reqId: number, l: { title: string; note: string | null; url: string }, userId: string): Promise<EvidenceItem> {
  const [row] = await sql<Row[]>`
    INSERT INTO bayanat.gov_compliance_evidence_items (req_id, kind_code, title_text, note_text, link_url, added_by_user_id)
    VALUES (${reqId}, 'LINK', ${l.title}, ${l.note}, ${l.url}, ${userId})
    RETURNING ${COLUMNS}
  `;
  return shape(row);
}

/** Changes what was sent and leaves the rest. A new file replaces the stored document. */
export async function updateEvidenceItem(
  reqId: number, evidenceId: number,
  patch: { title?: string; note?: string | null; url?: string; file?: { fileName: string; data: Buffer } },
  userId: string,
): Promise<EvidenceItem | null> {
  const f = patch.file;
  const rows = await sql<Row[]>`
    UPDATE bayanat.gov_compliance_evidence_items SET
      title_text = ${patch.title === undefined ? sql`title_text` : patch.title},
      note_text  = ${patch.note === undefined ? sql`note_text` : patch.note},
      link_url   = ${patch.url === undefined ? sql`link_url` : sql`CASE WHEN kind_code = 'LINK' THEN ${patch.url}::text ELSE link_url END`},
      file_name  = ${f ? sql`CASE WHEN kind_code = 'FILE' THEN ${f.fileName}::varchar ELSE file_name END` : sql`file_name`},
      mime_type  = ${f ? sql`CASE WHEN kind_code = 'FILE' THEN ${evidenceMimeType(f.fileName)}::varchar ELSE mime_type END` : sql`mime_type`},
      file_size  = ${f ? sql`CASE WHEN kind_code = 'FILE' THEN ${f.data.length}::int ELSE file_size END` : sql`file_size`},
      file_data  = ${f ? sql`CASE WHEN kind_code = 'FILE' THEN ${f.data}::bytea ELSE file_data END` : sql`file_data`},
      updated_by_user_id = ${userId}, updated_at = now()
    WHERE req_id = ${reqId} AND evidence_id = ${evidenceId}
    RETURNING ${COLUMNS}
  `;
  return rows[0] ? shape(rows[0]) : null;
}

export async function deleteEvidenceItem(reqId: number, evidenceId: number): Promise<boolean> {
  const rows = await sql`DELETE FROM bayanat.gov_compliance_evidence_items WHERE req_id = ${reqId} AND evidence_id = ${evidenceId} RETURNING evidence_id`;
  return rows.length > 0;
}

/** One line in the requirement's change history. */
export async function logEvidenceChange(reqId: number, frameworkId: number, oldValue: string | null, newValue: string | null, userId: string): Promise<void> {
  await sql`
    INSERT INTO bayanat.gov_compliance_history (req_id, framework_id, field_name, old_value, new_value, changed_by)
    VALUES (${reqId}, ${frameworkId}, 'evidenceFile', ${oldValue}, ${newValue}, ${userId})
  `.catch(() => {});
}
