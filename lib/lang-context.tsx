"use client";

import { createContext, useContext, useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { en } from "./i18n/en";
import { ar } from "./i18n/ar";
import type { I18nStrings } from "./i18n/strings";

export type Lang = "en" | "ar";
export type TranslationRow = { key: string; lang: string; value: string };

// Two-level map: GROUP → CODE → { en, ar }
export type LookupCache = Record<string, Record<string, { en: string; ar: string | null }>>;

type Ctx = {
  lang:               Lang;
  setLang:            (l: Lang) => void;
  t:                  I18nStrings;
  isRtl:              boolean;
  dbTranslations:     TranslationRow[];
  reloadTranslations: () => void;
  lookupCache:        LookupCache;
  lookupLabel:        (group: string, code: string) => string;
  reloadLookups:      () => void;
};

const LangCtx = createContext<Ctx>({
  lang: "en", setLang: () => {}, t: en, isRtl: false,
  dbTranslations: [], reloadTranslations: () => {},
  lookupCache: {}, lookupLabel: (_g, code) => code, reloadLookups: () => {},
});

export const useLang = () => useContext(LangCtx);

const STORAGE_KEY = "bayanatix_lang";
const COOKIE_KEY  = "bayanatix_lang";

function applyToDocument(l: Lang) {
  document.documentElement.dir  = l === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = l;
}

// Deep-merge DB override rows into a base I18nStrings object.
function applyOverrides(base: I18nStrings, forLang: Lang, rows: TranslationRow[]): I18nStrings {
  const relevant = rows.filter((r) => r.lang === forLang);
  if (relevant.length === 0) return base;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = JSON.parse(JSON.stringify(base));
  for (const { key, value } of relevant) {
    const parts = key.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let obj: any = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (obj == null) break;
      obj = obj[parts[i]];
    }
    if (obj != null) obj[parts[parts.length - 1]] = value;
  }
  return result as I18nStrings;
}

async function fetchLookupCache(): Promise<LookupCache> {
  try {
    const r = await fetch("/api/lookups/all");
    if (r.ok) return r.json();
  } catch {}
  return {};
}

export function LangProvider({ children, initialLang }: { children: ReactNode; initialLang?: Lang }) {
  const [lang, setLangState]        = useState<Lang>(initialLang ?? "en");
  const [dbTranslations, setDbRows] = useState<TranslationRow[]>([]);
  const [lookupCache, setLookupCache] = useState<LookupCache>({});

  // Apply document direction for SSR-provided initial lang immediately
  useEffect(() => {
    if (initialLang) applyToDocument(initialLang);
  }, []); // eslint-disable-line

  // Load saved language + fetch DB overrides + lookup cache on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved === "ar" || saved === "en") {
      setLangState(saved);
      applyToDocument(saved);
    }

    fetch("/api/admin/translations")
      .then((r) => r.ok ? r.json() : [])
      .then((rows: TranslationRow[]) => setDbRows(rows))
      .catch(() => {});

    fetchLookupCache().then(setLookupCache);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.cookie = `${COOKIE_KEY}=${l}; path=/; max-age=31536000; SameSite=Lax`;
    applyToDocument(l);
  }

  function reloadTranslations() {
    fetch("/api/admin/translations")
      .then((r) => r.ok ? r.json() : [])
      .then((rows: TranslationRow[]) => setDbRows(rows))
      .catch(() => {});
  }

  function reloadLookups() {
    fetchLookupCache().then(setLookupCache);
  }

  const t = useMemo(() => {
    const base = lang === "ar" ? ar : en;
    return applyOverrides(base, lang, dbTranslations);
  }, [lang, dbTranslations]);

  const isRtl = lang === "ar";

  const value = useMemo(
    () => ({
      lang, setLang, t, isRtl, dbTranslations, reloadTranslations,
      lookupCache, reloadLookups,
      lookupLabel: (group: string, code: string): string => {
        const entry = lookupCache[group]?.[code];
        if (!entry) return code;
        return (lang === "ar" && entry.ar) ? entry.ar : entry.en;
      },
    }),
    [lang, t, isRtl, dbTranslations, lookupCache] // eslint-disable-line
  );

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}
