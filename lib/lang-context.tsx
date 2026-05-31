"use client";

import { createContext, useContext, useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { en } from "./i18n/en";
import { ar } from "./i18n/ar";
import type { I18nStrings } from "./i18n/strings";
import { DEFAULT_SECONDARY, getLangDef } from "./lang-config";
import type { LanguageDef } from "./lang-config";

// "en" is always the base language; the second language code comes from DB config
export type Lang = string;
export type TranslationRow = { key: string; lang: string; value: string };

// Two-level map: GROUP → CODE → { en: string; [langCode]: string | null }
export type LookupCache = Record<string, Record<string, Record<string, string | null>>>;

type Ctx = {
  lang:               Lang;
  setLang:            (l: Lang) => void;
  t:                  I18nStrings;
  isRtl:              boolean;
  secondaryLangDef:   LanguageDef;
  dbTranslations:     TranslationRow[];
  reloadTranslations: () => void;
  reloadSystemConfig: () => void;
  lookupCache:        LookupCache;
  lookupLabel:        (group: string, code: string) => string;
  reloadLookups:      () => void;
};

const LangCtx = createContext<Ctx>({
  lang: "en", setLang: () => {}, t: en, isRtl: false,
  secondaryLangDef: DEFAULT_SECONDARY,
  dbTranslations: [], reloadTranslations: () => {}, reloadSystemConfig: () => {},
  lookupCache: {}, lookupLabel: (_g, code) => code, reloadLookups: () => {},
});

export const useLang = () => useContext(LangCtx);

const STORAGE_KEY = "bayanatix_lang";
const COOKIE_KEY  = "bayanatix_lang";

// Strings indexed by language code; add more entries as language files are added
const LANG_STRINGS: Record<string, I18nStrings> = { en, ar };

function applyToDocument(l: Lang, secondaryDef: LanguageDef) {
  const isSecondary = l !== "en";
  document.documentElement.dir  = (isSecondary && secondaryDef.direction === "rtl") ? "rtl" : "ltr";
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

async function fetchSecondaryLangDef(): Promise<LanguageDef> {
  try {
    const r = await fetch("/api/admin/system-config");
    if (r.ok) {
      const { config } = await r.json();
      const code = config?.secondary_language ?? "ar";
      return getLangDef(code) ?? DEFAULT_SECONDARY;
    }
  } catch {}
  return DEFAULT_SECONDARY;
}

export function LangProvider({ children, initialLang }: { children: ReactNode; initialLang?: Lang }) {
  const [lang,             setLangState]        = useState<Lang>(initialLang ?? "en");
  const [secondaryLangDef, setSecondaryLangDef] = useState<LanguageDef>(DEFAULT_SECONDARY);
  const [dbTranslations,   setDbRows]           = useState<TranslationRow[]>([]);
  const [lookupCache,      setLookupCache]      = useState<LookupCache>({});

  // Apply document direction for SSR-provided initial lang immediately
  useEffect(() => {
    if (initialLang) applyToDocument(initialLang, DEFAULT_SECONDARY);
  }, []); // eslint-disable-line

  // Load system config (secondary lang), saved language preference, translations, lookups
  useEffect(() => {
    fetchSecondaryLangDef().then(def => {
      setSecondaryLangDef(def);

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === def.code) {
        setLangState(saved as Lang);
        applyToDocument(saved as Lang, def);
      }
    });

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
    applyToDocument(l, secondaryLangDef);
  }

  function reloadTranslations() {
    fetch("/api/admin/translations")
      .then((r) => r.ok ? r.json() : [])
      .then((rows: TranslationRow[]) => setDbRows(rows))
      .catch(() => {});
  }

  function reloadSystemConfig() {
    fetchSecondaryLangDef().then(def => {
      setSecondaryLangDef(def);
      // If current lang is no longer valid, reset to English
      setLangState(prev => {
        if (prev !== "en" && prev !== def.code) {
          applyToDocument("en", def);
          localStorage.setItem(STORAGE_KEY, "en");
          return "en";
        }
        applyToDocument(prev, def);
        return prev;
      });
    });
  }

  function reloadLookups() {
    fetchLookupCache().then(setLookupCache);
  }

  const t = useMemo(() => {
    const base = LANG_STRINGS[lang] ?? en;
    return applyOverrides(base, lang, dbTranslations);
  }, [lang, dbTranslations]);

  const isRtl = lang !== "en" && secondaryLangDef.direction === "rtl";

  const value = useMemo(
    () => ({
      lang, setLang, t, isRtl, secondaryLangDef,
      dbTranslations, reloadTranslations, reloadSystemConfig,
      lookupCache, reloadLookups,
      lookupLabel: (group: string, code: string): string => {
        const entry = lookupCache[group]?.[code];
        if (!entry) return code;
        // Use the secondary language value when active, fall back to English
        if (lang !== "en") {
          const secondary = entry[secondaryLangDef.code];
          if (secondary) return secondary;
        }
        return entry["en"] ?? code;
      },
    }),
    [lang, t, isRtl, secondaryLangDef, dbTranslations, lookupCache] // eslint-disable-line
  );

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}
