"use client";

import { createContext, useContext, useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { en } from "./i18n/en";
import type { I18nStrings } from "./i18n/strings";

// "en" is always the compile-time base language; every other language is admin-
// configured at runtime (bayanat.languages) — there's no fixed "the one secondary
// language" anymore (spec FR-1: any number of languages).
export type Lang = string;

export type RuntimeLanguage = { languageCode: string; languageNameText: string; orientationCode: "LTR" | "RTL"; isDefault: boolean };

// Two-level map: GROUP → CODE → { en, [langCode]: string | null } — backed by
// bayanat.translations for every enabled language now, not just a hardcoded 'ar'
// column, but kept in this shape so existing lookupLabel(group, code) call sites
// across the app don't need to change.
export type LookupCache = Record<string, Record<string, Record<string, string | null>>>;

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: I18nStrings;
  isRtl: boolean;
  languages: RuntimeLanguage[];
  defaultLanguageCode: string;
  reloadLanguages: () => void;
  reloadBundle: () => void;
  lookupCache: LookupCache;
  lookupLabel: (group: string, code: string) => string;
  reloadLookups: () => void;
};

const DEFAULT_LANGUAGES: RuntimeLanguage[] = [{ languageCode: "en", languageNameText: "English", orientationCode: "LTR", isDefault: true }];

const LangCtx = createContext<Ctx>({
  lang: "en", setLang: () => {}, t: en, isRtl: false,
  languages: DEFAULT_LANGUAGES, defaultLanguageCode: "en",
  reloadLanguages: () => {}, reloadBundle: () => {},
  lookupCache: {}, lookupLabel: (_g, code) => code, reloadLookups: () => {},
});

export const useLang = () => useContext(LangCtx);

const STORAGE_KEY = "bayanatix_lang";
const COOKIE_KEY = "bayanatix_lang";

function applyToDocument(l: Lang, languages: RuntimeLanguage[]) {
  const def = languages.find((x) => x.languageCode === l);
  document.documentElement.dir = def?.orientationCode === "RTL" ? "rtl" : "ltr";
  document.documentElement.lang = l;
}

// Deep-merge a flattened dot-path key->value bundle onto a cloned English base object.
function applyBundle(base: I18nStrings, bundle: Record<string, string>): I18nStrings {
  if (Object.keys(bundle).length === 0) return base;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = JSON.parse(JSON.stringify(base));
  for (const [key, value] of Object.entries(bundle)) {
    const parts = key.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let obj: any = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (obj == null) break;
      obj = obj[parts[i]];
    }
    if (obj != null && parts[parts.length - 1] in obj) obj[parts[parts.length - 1]] = value;
  }
  return result as I18nStrings;
}

async function fetchLanguages(): Promise<RuntimeLanguage[]> {
  try {
    const r = await fetch("/api/languages");
    if (r.ok) {
      const { languages } = await r.json();
      return languages?.length > 0 ? languages : DEFAULT_LANGUAGES;
    }
  } catch {}
  return DEFAULT_LANGUAGES;
}

async function fetchBundle(lang: Lang): Promise<Record<string, string>> {
  if (lang === "en") return {};
  try {
    const r = await fetch(`/api/translations/bundle?lang=${encodeURIComponent(lang)}`);
    if (r.ok) {
      const { bundle } = await r.json();
      return bundle ?? {};
    }
  } catch {}
  return {};
}

async function fetchLookupCache(): Promise<LookupCache> {
  try {
    const r = await fetch("/api/lookups/all");
    if (r.ok) return r.json();
  } catch {}
  return {};
}

export function LangProvider({ children, initialLang }: { children: ReactNode; initialLang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? "en");
  const [languages, setLanguages] = useState<RuntimeLanguage[]>(DEFAULT_LANGUAGES);
  const [bundle, setBundle] = useState<Record<string, string>>({});
  const [lookupCache, setLookupCache] = useState<LookupCache>({});

  // Apply document direction for the SSR-provided initial lang immediately, before
  // the languages list has loaded (best-effort LTR guess for anything non-English).
  useEffect(() => {
    if (initialLang && initialLang !== "en") document.documentElement.dir = "rtl";
    if (initialLang) document.documentElement.lang = initialLang;
  }, []); // eslint-disable-line

  useEffect(() => {
    fetchLanguages().then((langs) => {
      setLanguages(langs);
      const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const resolved = saved && langs.some((l) => l.languageCode === saved) ? saved : lang;
      setLangState(resolved);
      applyToDocument(resolved, langs);
      if (resolved !== "en") fetchBundle(resolved).then(setBundle);
    });

    fetchLookupCache().then(setLookupCache);
  }, []); // eslint-disable-line

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.cookie = `${COOKIE_KEY}=${l}; path=/; max-age=31536000; SameSite=Lax`;
    applyToDocument(l, languages);
    fetchBundle(l).then(setBundle);
    fetch("/api/users/me/language", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ languageCode: l }),
    }).catch(() => {}); // best-effort cross-device persistence; no session (e.g. login page) just 401s silently
  }

  function reloadBundle() {
    fetchBundle(lang).then(setBundle);
  }

  function reloadLanguages() {
    fetchLanguages().then((langs) => {
      setLanguages(langs);
      setLangState((prev) => {
        if (!langs.some((l) => l.languageCode === prev)) {
          const fallback = langs.find((l) => l.isDefault)?.languageCode ?? "en";
          applyToDocument(fallback, langs);
          localStorage.setItem(STORAGE_KEY, fallback);
          if (fallback !== "en") fetchBundle(fallback).then(setBundle);
          return fallback;
        }
        applyToDocument(prev, langs);
        return prev;
      });
    });
  }

  function reloadLookups() {
    fetchLookupCache().then(setLookupCache);
  }

  const t = useMemo(() => applyBundle(en, bundle), [bundle]);
  const isRtl = languages.find((l) => l.languageCode === lang)?.orientationCode === "RTL";
  const defaultLanguageCode = languages.find((l) => l.isDefault)?.languageCode ?? "en";

  const value = useMemo(
    () => ({
      lang, setLang, t, isRtl, languages, defaultLanguageCode,
      reloadLanguages, reloadBundle, lookupCache, reloadLookups,
      lookupLabel: (group: string, code: string): string => {
        const entry = lookupCache[group]?.[code];
        if (!entry) return code;
        if (lang !== "en") {
          const translated = entry[lang];
          if (translated) return translated;
        }
        return entry["en"] ?? code;
      },
    }),
    [lang, t, isRtl, languages, defaultLanguageCode, lookupCache] // eslint-disable-line
  );

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}
