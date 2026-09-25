import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/types";
import { en } from "./en";
import { ar } from "./ar";
import type { I18nStrings } from "./strings";

// Server Components can't call useLang() (client-only context), but most of
// them still hardcode English-only breadcrumb/heading text. This mirrors the
// same "which static bundle" choice lang-context.tsx makes client-side — good
// enough for static UI strings; it does NOT read the DB-backed translation
// bundle (admin Workbench overrides, AI-translated content), so a string an
// admin only edited in the Workbench won't show up here. Add more languages
// to DICTS as lib/i18n gains them.
const DICTS: Record<string, I18nStrings> = { en, ar };

// Same precedence as (app)/layout.tsx's own initialLang resolution (AC-3):
// the user's persisted choice wins (cross-device), then the bayanatix_lang
// cookie LangProvider.setLang() writes (e.g. not-yet-logged-in device), then
// English. Deliberately skips layout.tsx's third tier — the entity default
// language looked up via getLanguages(false) — since that needs two DB
// queries (including a cross-join coverage aggregate) and only matters for
// a user who has neither a saved preference nor a cookie, i.e. their very
// first page view; falling back to English for that rare case rather than
// paying the query cost on every Server Component page render.
//
// Pass the session if the caller already has it in scope (most page.tsx
// files call getSession() before this) to avoid re-verifying the JWT twice;
// omit it and this fetches its own.
export async function getServerLang(user?: SessionUser | null): Promise<string> {
  const u = user !== undefined ? user : await getSession();
  if (u?.preferredLanguageCode && u.preferredLanguageCode in DICTS) return u.preferredLanguageCode;
  const raw = cookies().get("bayanatix_lang")?.value;
  return raw && raw in DICTS ? raw : "en";
}

export async function getServerT(user?: SessionUser | null): Promise<I18nStrings> {
  return DICTS[await getServerLang(user)];
}
