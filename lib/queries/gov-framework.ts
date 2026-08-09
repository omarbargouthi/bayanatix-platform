import { sql } from "../db";

export type GovDoc = {
  docId:         number;
  sectionCode:   string;
  title:         string;
  description:   string | null;
  statusCode:    string;
  versionText:   string | null;
  effectiveDate: string | null;
  expiryDate:    string | null;
  ownerUserId:   string | null;
  ownerName:     string | null;
  sourceUrl:     string | null;
  createdAt:     string;
  updatedAt:     string;
  createdBy:     string | null;
  attachmentCount: number;
};

export type GovAttachment = {
  attachmentId:  number;
  docId:         number;
  fileName:      string;
  fileSizeBytes: number | null;
  fileMimeType:  string | null;
  uploadedAt:    string;
  uploadedBy:    string | null;
};

export async function listGovDocs(sectionCode?: string): Promise<GovDoc[]> {
  return sql<GovDoc[]>`
    SELECT
      d.doc_id          AS "docId",
      d.section_code    AS "sectionCode",
      d.title,
      d.description,
      d.status_code     AS "statusCode",
      d.version_text    AS "versionText",
      d.effective_date::text AS "effectiveDate",
      d.expiry_date::text    AS "expiryDate",
      d.owner_user_id   AS "ownerUserId",
      u.full_name       AS "ownerName",
      d.source_url      AS "sourceUrl",
      d.created_at::text AS "createdAt",
      d.updated_at::text AS "updatedAt",
      d.created_by      AS "createdBy",
      COUNT(a.attachment_id)::int AS "attachmentCount"
    FROM bayanat.gov_framework_docs d
    LEFT JOIN bayanat.users u ON u.user_id = d.owner_user_id
    LEFT JOIN bayanat.gov_framework_attachments a ON a.doc_id = d.doc_id
    ${sectionCode ? sql`WHERE d.section_code = ${sectionCode}` : sql``}
    GROUP BY d.doc_id, u.full_name
    ORDER BY d.updated_at DESC
  `;
}

export async function getGovDoc(docId: number): Promise<GovDoc | null> {
  const rows = await sql<GovDoc[]>`
    SELECT
      d.doc_id          AS "docId",
      d.section_code    AS "sectionCode",
      d.title,
      d.description,
      d.status_code     AS "statusCode",
      d.version_text    AS "versionText",
      d.effective_date::text AS "effectiveDate",
      d.expiry_date::text    AS "expiryDate",
      d.owner_user_id   AS "ownerUserId",
      u.full_name       AS "ownerName",
      d.source_url      AS "sourceUrl",
      d.created_at::text AS "createdAt",
      d.updated_at::text AS "updatedAt",
      d.created_by      AS "createdBy",
      COUNT(a.attachment_id)::int AS "attachmentCount"
    FROM bayanat.gov_framework_docs d
    LEFT JOIN bayanat.users u ON u.user_id = d.owner_user_id
    LEFT JOIN bayanat.gov_framework_attachments a ON a.doc_id = d.doc_id
    WHERE d.doc_id = ${docId}
    GROUP BY d.doc_id, u.full_name
  `;
  return rows[0] ?? null;
}

export async function createGovDoc(data: {
  sectionCode: string; title: string; description?: string;
  statusCode?: string; versionText?: string; effectiveDate?: string;
  expiryDate?: string; ownerUserId?: string; sourceUrl?: string; createdBy: string;
}): Promise<number> {
  const rows = await sql<{ docId: number }[]>`
    INSERT INTO bayanat.gov_framework_docs
      (section_code, title, description, status_code, version_text, effective_date, expiry_date, owner_user_id, source_url, created_by)
    VALUES (
      ${data.sectionCode}, ${data.title}, ${data.description ?? null},
      ${data.statusCode ?? 'DRAFT'}, ${data.versionText ?? null},
      ${data.effectiveDate ?? null}, ${data.expiryDate ?? null},
      ${data.ownerUserId ?? null}, ${data.sourceUrl ?? null}, ${data.createdBy}
    )
    RETURNING doc_id AS "docId"
  `;
  return rows[0].docId;
}

export async function updateGovDoc(docId: number, data: {
  title?: string; description?: string; statusCode?: string;
  versionText?: string; effectiveDate?: string; expiryDate?: string;
  ownerUserId?: string; sourceUrl?: string;
}): Promise<void> {
  await sql`
    UPDATE bayanat.gov_framework_docs SET
      title          = COALESCE(${data.title ?? null}, title),
      description    = COALESCE(${data.description ?? null}, description),
      status_code    = COALESCE(${data.statusCode ?? null}, status_code),
      version_text   = COALESCE(${data.versionText ?? null}, version_text),
      effective_date = COALESCE(${data.effectiveDate ?? null}::date, effective_date),
      expiry_date    = COALESCE(${data.expiryDate ?? null}::date, expiry_date),
      owner_user_id  = COALESCE(${data.ownerUserId ?? null}, owner_user_id),
      source_url     = ${data.sourceUrl !== undefined ? data.sourceUrl : sql`source_url`},
      updated_at     = NOW()
    WHERE doc_id = ${docId}
  `;
}

export async function deleteGovDoc(docId: number): Promise<void> {
  await sql`DELETE FROM bayanat.gov_framework_docs WHERE doc_id = ${docId}`;
}

export async function listAttachments(docId: number): Promise<GovAttachment[]> {
  return sql<GovAttachment[]>`
    SELECT attachment_id AS "attachmentId", doc_id AS "docId",
           file_name AS "fileName", file_size_bytes AS "fileSizeBytes",
           file_mime_type AS "fileMimeType",
           uploaded_at::text AS "uploadedAt", uploaded_by AS "uploadedBy"
    FROM bayanat.gov_framework_attachments
    WHERE doc_id = ${docId}
    ORDER BY uploaded_at DESC
  `;
}

export async function addAttachment(data: {
  docId: number; fileName: string; fileSizeBytes?: number;
  fileMimeType?: string; fileData?: Buffer; uploadedBy: string;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.gov_framework_attachments
      (doc_id, file_name, file_size_bytes, file_mime_type, file_data, uploaded_by)
    VALUES (${data.docId}, ${data.fileName}, ${data.fileSizeBytes ?? null},
            ${data.fileMimeType ?? null}, ${data.fileData ?? null}, ${data.uploadedBy})
    RETURNING attachment_id AS id
  `;
  return rows[0].id;
}

export async function deleteAttachment(attachmentId: number): Promise<void> {
  await sql`DELETE FROM bayanat.gov_framework_attachments WHERE attachment_id = ${attachmentId}`;
}

export async function getAttachmentData(attachmentId: number): Promise<{ fileName: string; fileMimeType: string | null; fileData: Buffer | null } | null> {
  const rows = await sql<{ fileName: string; fileMimeType: string | null; fileData: Buffer | null }[]>`
    SELECT file_name AS "fileName", file_mime_type AS "fileMimeType", file_data AS "fileData"
    FROM bayanat.gov_framework_attachments WHERE attachment_id = ${attachmentId}
  `;
  return rows[0] ?? null;
}

export async function getSectionCounts(): Promise<Record<string, number>> {
  const rows = await sql<{ sectionCode: string; cnt: number }[]>`
    SELECT section_code AS "sectionCode", COUNT(*)::int AS cnt
    FROM bayanat.gov_framework_docs
    GROUP BY section_code
  `;
  return Object.fromEntries(rows.map((r) => [r.sectionCode, r.cnt]));
}
