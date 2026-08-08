import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { updateTranslation } from "@/lib/queries/translations";
import * as XLSX from "xlsx";

// Spec FR-2.4: round-trips the export/route.ts sheet shape. Only rows present in the
// sheet with a non-empty translated_text are touched — everything else in the
// workbench is left alone. Matched by key_code, not row position, so re-ordering or
// deleting rows in the spreadsheet before re-upload is safe. Each write goes through
// updateTranslation (status -> HUMAN_EDITED, audited via logUpdate), same as a manual
// workbench edit — an import IS a batch of manual edits.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const languageCode = formData.get("languageCode") as string | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!languageCode) return NextResponse.json({ error: "Missing languageCode" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  let updated = 0, skippedEmpty = 0;
  const notFound: string[] = [];

  for (const row of sheetRows) {
    const keyCode = String(row.key_code ?? "").trim();
    const text = String(row.translated_text ?? "").trim();
    if (!keyCode) continue;
    if (!text) { skippedEmpty++; continue; }

    const [key] = await sql<{ keyId: number }[]>`SELECT key_id AS "keyId" FROM bayanat.translation_keys WHERE key_code = ${keyCode}`;
    if (!key) { notFound.push(keyCode); continue; }

    await updateTranslation(key.keyId, languageCode, text, session.userId);
    updated++;
  }

  return NextResponse.json({ updated, skippedEmpty, notFound });
}
