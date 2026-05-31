import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import crypto from "crypto";
import { getLangDef } from "@/lib/lang-config";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const text: string = body.text;
  // Default "en" = translate source text → English (used by assessment view for Arabic requirements).
  // Pass any BCP-47 code to translate English → that language.
  const targetLang: string = body.targetLang ?? "en";

  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  // Cache key uses targetLang code so different languages are cached separately.
  // "ar:..." and "en:..." are backward-compatible with the previous implementation.
  const hashKey = `${targetLang}:${text.trim()}`;
  const hash = crypto.createHash("sha256").update(hashKey).digest("hex");

  // Check cache first
  const cached = await sql<{ translated_text: string }[]>`
    SELECT translated_text FROM bayanat.compliance_translations WHERE source_hash = ${hash}
  `;
  if (cached.length > 0) {
    return NextResponse.json({ translation: cached[0].translated_text, cached: true });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Translation service not configured. Add ANTHROPIC_API_KEY to .env.local" },
      { status: 503 }
    );
  }

  const langDef = getLangDef(targetLang);
  const langName = langDef?.displayName ?? targetLang.toUpperCase();

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const prompt = targetLang === "en"
    ? `Translate the following text to English accurately. Return only the translation with no extra commentary:\n\n${text.trim()}`
    : `Translate the following English text to ${langName} accurately. Return only the translation with no extra commentary:\n\n${text.trim()}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  const translated = block.type === "text" ? block.text.trim() : "";

  if (translated) {
    await sql`
      INSERT INTO bayanat.compliance_translations (source_hash, source_text, translated_text)
      VALUES (${hash}, ${text.trim()}, ${translated})
      ON CONFLICT (source_hash) DO NOTHING
    `;
  }

  return NextResponse.json({ translation: translated, cached: false });
}
