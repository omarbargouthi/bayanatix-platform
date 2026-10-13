"use client";

// Small shared pieces of the impact assessment screens: badges, the asset picker, and
// the catalog facts written out as lines (shown under a question, and copied into its
// answer on request).
import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";
import type { DpiaStatus, RiskLevel } from "@/lib/privacy/dpia-types";
import { assetTypeLabel } from "@/lib/privacy/dpia-text";

export { fill, day, assetTypeLabel, flagText, factLines, FACT_BLOCKS, type FactBlock } from "@/lib/privacy/dpia-text";

const STATUS_STYLE: Record<DpiaStatus, string> = {
  SCREENING: "bg-sky-50 text-sky-700 border-sky-200", ASSESSMENT: "bg-violet-50 text-violet-700 border-violet-200",
  IN_REVIEW: "bg-amber-50 text-amber-800 border-amber-200", NOT_REQUIRED: "bg-slate-100 text-slate-600 border-slate-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200", APPROVED_WITH_CONDITIONS: "bg-teal-50 text-teal-800 border-teal-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};
const LEVEL_STYLE: Record<RiskLevel, string> = {
  LOW: "bg-emerald-50 text-emerald-700 border-emerald-200", MEDIUM: "bg-amber-50 text-amber-800 border-amber-200", HIGH: "bg-red-50 text-red-700 border-red-200",
};
const PILL = "inline-block text-[11px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap";

export function StatusBadge({ status }: { status: DpiaStatus }) {
  const { t } = useLang();
  return <span className={`${PILL} ${STATUS_STYLE[status]}`}>{t.dpia.statuses[status]}</span>;
}
export function LevelBadge({ level }: { level: RiskLevel | null }) {
  const { t } = useLang();
  if (!level) return <span className="text-[12px] text-muted">—</span>;
  return <span className={`${PILL} ${LEVEL_STYLE[level]}`}>{t.dpia.levels[level]}</span>;
}

export function FactLines({ lines }: { lines: string[] }) {
  const { t } = useLang();
  if (lines.length === 0) return <p className="text-[12px] text-muted">{t.dpia.facts.none}</p>;
  return <ul className="space-y-0.5 text-[12px] text-ink-soft">{lines.map((l, i) => <li key={i} dir="auto" className="break-words">{l}</li>)}</ul>;
}

export type CustomTypeOption = { typeCode: string; name: string };
type Hit = { typeCode: string; id: number; name: string; sublabel: string | null };

/** Pick any asset: choose the kind, then search by name. */
export function AssetPicker({ customTypes, onPick, defaultType }: { customTypes: CustomTypeOption[]; onPick: (h: Hit) => void; defaultType?: string }) {
  const { t } = useLang();
  const d = t.dpia;
  const kinds = [...customTypes.map((c) => ({ code: `CUSTOM:${c.typeCode}`, label: c.name })), ...["DATA_SOURCES", "DATA_SCHEMAS", "DATA_ENTITIES", "DATA_ATTRIBUTES"].map((c) => ({ code: c, label: assetTypeLabel(t, c, c) }))];
  const [kind, setKind] = useState(defaultType ?? kinds[0]?.code ?? "DATA_ENTITIES");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`/api/custom-assets/search-endpoints?types=${encodeURIComponent(kind)}&q=${encodeURIComponent(query.trim())}`)
        .then((r) => (r.ok ? r.json() : [])).then(setHits).catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [kind, query]);
  return (
    <div className="flex gap-2">
      <select className="input-field w-44 shrink-0" value={kind} onChange={(e) => { setKind(e.target.value); setQuery(""); }} aria-label={d.assetKind}>
        {kinds.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
      </select>
      <div className="relative flex-1">
        <input className="input-field w-full" placeholder={d.assetSearchPh} value={query} dir="auto"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
        {open && (
          <div className="absolute z-50 top-full start-0 end-0 mt-1 bg-white border border-line rounded-lg shadow-xl max-h-56 overflow-y-auto">
            {hits.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">{d.assetNoMatch}</div>}
            {hits.map((h) => (
              <button key={`${h.typeCode}:${h.id}`} type="button" onMouseDown={() => { onPick(h); setQuery(""); setOpen(false); }}
                className="w-full text-start px-3 py-2 hover:bg-canvas-soft border-b border-line-soft last:border-b-0">
                <div className="text-[12px] font-medium text-ink" dir="auto">{h.name}</div>
                {h.sublabel && <div className="text-[10px] text-muted" dir="auto">{h.sublabel}</div>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-xl"} border border-line max-h-[90vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-start justify-between">
          <h2 className="text-[16px] font-bold text-brand-deep">{title}</h2>
          <button onClick={onClose} aria-label={t.common.close} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-3 overflow-y-auto">{children}</div>
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-line">{footer}</div>
      </div>
    </div>
  );
}

export const ErrorNote = ({ text }: { text: string | null }) => (text ? <div className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{text}</div> : null);

/** The server's error in the user's language when its code is known. */
export const errorText = (t: I18nStrings, res: { code?: string; error?: string }) => (t.dpia.errors as Record<string, string>)[res.code ?? ""] ?? res.error ?? t.dpia.failed;
