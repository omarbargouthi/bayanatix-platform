"use client";

import { useState, useRef, useEffect } from "react";
import { useLang } from "@/lib/lang-context";
import { IconGlobe } from "./icons";

// Real multi-language dropdown (spec FR-4.4) — replaces the old binary
// English/secondary toggle button in Header.tsx and Sidebar.tsx. Renders nothing
// when only one language is available (self-selection off, or a single-language
// deployment), matching the old toggle's own "nothing to switch to" behavior.
export function LanguagePicker({ collapsed = false, dropUp = false, triggerClassName }: {
  collapsed?: boolean;
  dropUp?: boolean;
  triggerClassName?: string;
}) {
  const { lang, setLang, languages } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (languages.length <= 1) return null;
  const active = languages.find((l) => l.languageCode === lang);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change language"
        title={active?.languageNameText ?? lang}
        className={
          triggerClassName ??
          `inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-md text-xs font-semibold transition-colors select-none ${
            lang !== "en" ? "border-brand-purple text-brand-purple bg-brand-purple/5" : "border-line text-ink-soft hover:border-brand-purple hover:text-brand-purple"
          }`
        }
      >
        <IconGlobe className="w-3.5 h-3.5 shrink-0" />
        {!collapsed && <span>{active?.languageNameText ?? lang}</span>}
      </button>
      {open && (
        <div className={`absolute right-0 ${dropUp ? "bottom-full mb-1" : "top-full mt-1"} w-40 bg-white border border-line rounded-md shadow-md py-1 z-50`}>
          {languages.map((l) => (
            <button
              key={l.languageCode}
              type="button"
              onClick={() => { setLang(l.languageCode); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-canvas transition-colors ${l.languageCode === lang ? "text-brand-purple font-semibold" : "text-ink-soft"}`}
            >
              {l.languageNameText}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
