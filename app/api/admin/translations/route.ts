import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export type TranslationRow = { key: string; lang: string; value: string };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await sql<TranslationRow[]>`
    SELECT key, lang, value FROM bayanat.ui_translations ORDER BY key, lang
  `;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key, lang, value } = await req.json() as TranslationRow;
  if (!key || !lang || value === undefined) {
    return NextResponse.json({ error: "key, lang and value required" }, { status: 400 });
  }
  await sql`
    INSERT INTO bayanat.ui_translations (key, lang, value)
    VALUES (${key}, ${lang}, ${value})
    ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key, lang } = await req.json() as { key: string; lang: string };
  await sql`DELETE FROM bayanat.ui_translations WHERE key = ${key} AND lang = ${lang}`;
  return NextResponse.json({ ok: true });
}
