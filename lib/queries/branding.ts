import { sql } from "../db";

export type BrandingInfo = { hasCustomLogo: boolean; logoFilename: string | null; updatedAt: string | null };

export async function getBrandingInfo(): Promise<BrandingInfo> {
  const [row] = await sql<{ logoData: Buffer | null; logoFilename: string | null; updatedAt: string }[]>`
    SELECT logo_data AS "logoData", logo_filename AS "logoFilename", updated_at AS "updatedAt"
    FROM bayanat.branding_settings WHERE settings_id = 1
  `;
  return {
    hasCustomLogo: !!row?.logoData,
    logoFilename: row?.logoFilename ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function getLogoBlob(): Promise<{ data: Buffer; mimeType: string } | null> {
  const [row] = await sql<{ logoData: Buffer | null; logoMimeType: string | null }[]>`
    SELECT logo_data AS "logoData", logo_mime_type AS "logoMimeType" FROM bayanat.branding_settings WHERE settings_id = 1
  `;
  if (!row?.logoData) return null;
  return { data: row.logoData, mimeType: row.logoMimeType ?? "image/svg+xml" };
}

export async function setLogo(data: Buffer, mimeType: string, filename: string): Promise<void> {
  await sql`
    UPDATE bayanat.branding_settings
    SET logo_data = ${data}, logo_mime_type = ${mimeType}, logo_filename = ${filename}, updated_at = NOW()
    WHERE settings_id = 1
  `;
}

export async function clearLogo(): Promise<void> {
  await sql`
    UPDATE bayanat.branding_settings
    SET logo_data = NULL, logo_mime_type = NULL, logo_filename = NULL, updated_at = NOW()
    WHERE settings_id = 1
  `;
}
