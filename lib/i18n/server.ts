import { cookies } from "next/headers";
import { en } from "./en";
import { ar } from "./ar";
import type { I18nStrings } from "./strings";

// Server Components can't call useLang() (client-only context), but most of
// them still hardcode English-only breadcrumb/heading text. This mirrors the
// same "which static bundle" choice lang-context.tsx makes client-side, keyed
// off the same bayanatix_lang cookie LangProvider.setLang() writes — good
// enough for static UI strings; it does NOT read the DB-backed translation
// bundle (admin Workbench overrides, AI-translated content), so a string an
// admin only edited in the Workbench won't show up here. Add more languages
// to DICTS as lib/i18n gains them.
const DICTS: Record<string, I18nStrings> = { en, ar };

export function getServerLang(): string {
  const raw = cookies().get("bayanatix_lang")?.value;
  return raw && raw in DICTS ? raw : "en";
}

export function getServerT(): I18nStrings {
  return DICTS[getServerLang()];
}
