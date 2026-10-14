"use client";

// A small "?" beside an indicator: opens a short note on how it is calculated, with a
// link to the matching Help Center page for the full explanation.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";

export function HelpTip({ text, href, align = "end" }: { text: string; href?: string; align?: "start" | "end" }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.help.howCalculated}
        aria-expanded={open}
        title={t.help.howCalculated}
        className={`w-[18px] h-[18px] grid place-items-center rounded-full border text-[11px] font-bold leading-none transition-colors ${
          open ? "bg-brand-purple text-white border-brand-purple" : "border-line text-muted hover:text-brand-purple hover:border-brand-purple"
        }`}
      >
        ?
      </button>
      {open && (
        <span
          role="dialog"
          className={`absolute top-full mt-2 ${align === "end" ? "end-0" : "start-0"} z-50 w-72 bg-white border border-line rounded-lg shadow-lg p-3.5 text-start font-normal`}
        >
          <span className="block text-[11px] font-bold uppercase tracking-wider text-brand-purple mb-1.5">{t.help.howCalculated}</span>
          <span className="block text-[12.5px] leading-relaxed text-ink-soft whitespace-pre-line">{text}</span>
          {href && (
            <Link href={href} onClick={() => setOpen(false)} className="inline-block mt-2.5 text-[12px] font-semibold text-brand-purple hover:underline">
              {t.help.readMore}
            </Link>
          )}
        </span>
      )}
    </span>
  );
}
