// Attachments of a Governance Framework document (db/173): any number of items, each a
// stored file or a link, with a title and a note that can be edited afterwards. Items
// have the same shape as the evidence items of a compliance requirement, so both are
// shown by the same component (components/governance/EvidenceAttachments.tsx) — which
// is why the id is returned as "evidenceId".
import { sql } from "../db";
import { evidenceMimeType, canPreviewType, type EvidenceItem } from "./compliance-evidence";

export type GovAttachmentItem = Omit<EvidenceItem, "reqId"> & { docId: number };

const COLUMNS = sql`
  attachment_id AS "evidenceId", doc_id AS "docId", kind_code AS kind,
  coalesce(title_text, file_name, link_url) AS title, note_text AS note,
  file_name AS "fileName", file_mime_type AS "mimeType", file_size_bytes::int AS "fileSize", link_url AS "linkUrl",
  uploaded_by AS "addedBy", uploaded_at::text AS "addedAt", updated_by AS "updatedBy", updated_at::text AS "updatedAt"
`;
type Row = Omit<GovAttachmentItem, "canPreview">;
const shape = (r: Row): GovAttachmentItem => ({ ...r, canPreview: r.kind === "FILE" && canPreviewType(r.mimeType) });

export async function govDocExists(docId: number): Promise<boolean> {
  if (!Number.isFinite(docId)) return false;
  const rows = await sql`SELECT 1 FROM bayanat.gov_framework_docs WHERE doc_id = ${docId}`;
  return rows.length > 0;
}

export async function listGovAttachments(docId: number): Promise<GovAttachmentItem[]> {
  const rows = await sql<Row[]>`SELECT ${COLUMNS} FROM bayanat.gov_framework_attachments WHERE doc_id = ${docId} ORDER BY attachment_id`;
  return rows.map(shape);
}

export async function getGovAttachment(docId: number, attachmentId: number): Promise<GovAttachmentItem | null> {
  const rows = await sql<Row[]>`SELECT ${COLUMNS} FROM bayanat.gov_framework_attachments WHERE doc_id = ${docId} AND attachment_id = ${attachmentId}`;
  return rows[0] ? shape(rows[0]) : null;
}

export async function getGovAttachmentFile(docId: number, attachmentId: number): Promise<{ fileName: string; mimeType: string; data: Buffer } | null> {
  const [row] = await sql<{ fileName: string | null; mimeType: string | null; data: Buffer | null }[]>`
    SELECT file_name AS "fileName", file_mime_type AS "mimeType", file_data AS data
    FROM bayanat.gov_framework_attachments WHERE doc_id = ${docId} AND attachment_id = ${attachmentId} AND kind_code = 'FILE'
  `;
  if (!row?.data || !row.fileName) return null;
  return { fileName: row.fileName, mimeType: row.mimeType ?? "application/octet-stream", data: row.data };
}

export async function addGovAttachmentFile(docId: number, f: { title: string; note: string | null; fileName: string; data: Buffer }, userId: string): Promise<GovAttachmentItem> {
  const [row] = await sql<Row[]>`
    INSERT INTO bayanat.gov_framework_attachments (doc_id, kind_code, title_text, note_text, file_name, file_mime_type, file_size_bytes, file_data, uploaded_by)
    VALUES (${docId}, 'FILE', ${f.title}, ${f.note}, ${f.fileName}, ${evidenceMimeType(f.fileName)}, ${f.data.length}, ${f.data}, ${userId})
    RETURNING ${COLUMNS}
  `;
  return shape(row);
}

export async function addGovAttachmentLink(docId: number, l: { title: string; note: string | null; url: string }, userId: string): Promise<GovAttachmentItem> {
  const [row] = await sql<Row[]>`
    INSERT INTO bayanat.gov_framework_attachments (doc_id, kind_code, title_text, note_text, link_url, uploaded_by)
    VALUES (${docId}, 'LINK', ${l.title}, ${l.note}, ${l.url}, ${userId})
    RETURNING ${COLUMNS}
  `;
  return shape(row);
}

/** Changes what was sent and leaves the rest. A new file replaces the stored one. */
export async function updateGovAttachment(
  docId: number, attachmentId: number,
  patch: { title?: string; note?: string | null; url?: string; file?: { fileName: string; data: Buffer } },
  userId: string,
): Promise<GovAttachmentItem | null> {
  const f = patch.file;
  const rows = await sql<Row[]>`
    UPDATE bayanat.gov_framework_attachments SET
      title_text = ${patch.title === undefined ? sql`title_text` : patch.title},
      note_text  = ${patch.note === undefined ? sql`note_text` : patch.note},
      link_url   = ${patch.url === undefined ? sql`link_url` : sql`CASE WHEN kind_code = 'LINK' THEN ${patch.url}::text ELSE link_url END`},
      file_name       = ${f ? sql`CASE WHEN kind_code = 'FILE' THEN ${f.fileName}::text ELSE file_name END` : sql`file_name`},
      file_mime_type  = ${f ? sql`CASE WHEN kind_code = 'FILE' THEN ${evidenceMimeType(f.fileName)}::text ELSE file_mime_type END` : sql`file_mime_type`},
      file_size_bytes = ${f ? sql`CASE WHEN kind_code = 'FILE' THEN ${f.data.length}::bigint ELSE file_size_bytes END` : sql`file_size_bytes`},
      file_data       = ${f ? sql`CASE WHEN kind_code = 'FILE' THEN ${f.data}::bytea ELSE file_data END` : sql`file_data`},
      updated_by = ${userId}, updated_at = now()
    WHERE doc_id = ${docId} AND attachment_id = ${attachmentId}
    RETURNING ${COLUMNS}
  `;
  return rows[0] ? shape(rows[0]) : null;
}

export async function deleteGovAttachment(docId: number, attachmentId: number): Promise<boolean> {
  const rows = await sql`DELETE FROM bayanat.gov_framework_attachments WHERE doc_id = ${docId} AND attachment_id = ${attachmentId} RETURNING attachment_id`;
  return rows.length > 0;
}
