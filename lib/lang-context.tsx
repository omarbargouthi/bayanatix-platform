"use client";

import { createContext, useContext, useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { en } from "./i18n/en";
import { ar } from "./i18n/ar";
import type { I18nStrings } from "./i18n/strings";

export type Lang = "en" | "ar";

type Ctx = {
  lang:    Lang;
  setLang: (l: Lang) => void;
  t:       I18nStrings;
  isRtl:   boolean;
};

const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, t: en, isRtl: false });

export const useLang = () => useContext(LangCtx);

const STORAGE_KEY = "bayanatix_lang";

function applyToDocument(l: Lang) {
  document.documentElement.dir  = l === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = l;
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // On mount, read persisted preference
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved === "ar" || saved === "en") {
      setLangState(saved);
      applyToDocument(saved);
    }
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    applyToDocument(l);
  }

  // en/ar are module-level constants — stable references, no useMemo overhead needed
  const t     = lang === "ar" ? ar : en;
  const isRtl = lang === "ar";

  const value = useMemo(() => ({ lang, setLang, t, isRtl }), [lang, t, isRtl]); // eslint-disable-line

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}
