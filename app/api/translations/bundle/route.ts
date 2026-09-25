import { NextResponse } from "next/server";
import { getTranslationBundle } from "@/lib/queries/translations";

/**
 * Flattened key->value bundle for one language, for lang-context.tsx to overlay
 * onto the English base object (spec FR-4.3). Deliberately unauthenticated, same
 * reasoning as /api/languages: this is non-sensitive static UI copy, and every
 * pre-auth LangProvider instance (login page, public FOI intake/tracking pages)
 * needs it before a session exists — previously required a session and 401'd for
 * all of them, so those pages silently never rendered any DB-backed Arabic text
 * (lang-context.tsx's fetchBundle() catches the failure and falls back to `{}`).
 */
export async function GET(req: Request) {
  const lang = new URL(req.url).searchParams.get("lang");
  if (!lang) return NextResponse.json({ error: "Missing lang query param" }, { status: 400 });

  const bundle = await getTranslationBundle(lang);
  return NextResponse.json({ bundle });
}
