import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import crypto from "crypto";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  const hash = crypto.createHash("sha256").update(text.trim()).digest("hex");

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

  // Dynamically import to avoid issues if SDK not present
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Translate the following Arabic text to English accurately. Return only the translation with no extra commentary:\n\n${text.trim()}`,
      },
    ],
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
