"use client";

import { useState, useEffect, useRef } from "react";

type SitType = { sitTypeId: number; sitName: string; classificationCode: string | null; description: string | null; patternCount: number };
type Suggestion = { sitTypeId: number; sitName: string; confidence: number; evidence: string[] };

function Chip({ sitType, onRemove }: { sitType: SitType; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[11px] font-medium bg-red-600">
      {sitType.sitName}
      <button type="button" onClick={onRemove} className="hover:opacity-70 leading-none text-[13px]">&times;</button>
    </span>
  );
}

// "Adding SIT to a business term" — a tag-like picker (chips + dropdown, same
// interaction shape as TagPicker), but every option is a specific catalog value
// (National ID, Email Address, ...), not a single fixed "SIT" tag. Selecting one
// attaches that value to the term via business_term_sit_types.
export function SitTypePicker({ glossaryId }: { glossaryId: number }) {
  const [allTypes, setAllTypes] = useState<SitType[]>([]);
  const [selected, setSelected] = useState<SitType[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/sit/types").then((r) => r.ok ? r.json() : []),
      fetch(`/api/glossary/terms/${glossaryId}/sit-types`).then((r) => r.ok ? r.json() : []),
    ]).then(([all, current]) => {
      setAllTypes(all);
      setSelected(current);
      setLoading(false);
    });
  }, [glossaryId]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function save(next: SitType[]) {
    setSelected(next);
    setSaving(true);
    await fetch(`/api/glossary/terms/${glossaryId}/sit-types`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sitTypeIds: next.map((t) => t.sitTypeId) }),
    });
    setSaving(false);
  }

  function toggle(sitType: SitType) {
    const next = selected.some((s) => s.sitTypeId === sitType.sitTypeId)
      ? selected.filter((s) => s.sitTypeId !== sitType.sitTypeId)
      : [...selected, sitType];
    void save(next);
  }

  async function runSuggest() {
    setSuggesting(true);
    setSuggestions(null);
    try {
      const r = await fetch(`/api/glossary/terms/${glossaryId}/suggest-sit-types`);
      setSuggestions(r.ok ? await r.json() : []);
    } finally {
      setSuggesting(false);
    }
  }

  function applySuggestion(s: Suggestion) {
    const sitType = allTypes.find((t) => t.sitTypeId === s.sitTypeId);
    if (!sitType || selected.some((sel) => sel.sitTypeId === s.sitTypeId)) return;
    void save([...selected, sitType]);
  }

  if (loading) return <div className="text-[11px] text-muted">Loading…</div>;

  return (
    <div>
      <div ref={ref} className="relative">
        <div
          className="flex flex-wrap gap-1.5 min-h-[34px] px-2.5 py-1.5 border border-line rounded-md bg-white cursor-pointer hover:border-brand-purple/60 transition-colors"
          onClick={() => setOpen((v) => !v)}
        >
          {selected.length === 0 && <span className="text-muted text-[13px] self-center">Add a SIT value…</span>}
          {selected.map((sel) => <Chip key={sel.sitTypeId} sitType={sel} onRemove={() => toggle(sel)} />)}
          {saving && <span className="text-[11px] text-muted self-center ml-1">Saving…</span>}
        </div>

        {open && (
          <div className="absolute z-50 mt-1 w-full min-w-[240px] bg-white border border-line rounded-xl shadow-lg max-h-64 overflow-y-auto py-1.5">
            {allTypes.length === 0 && <div className="px-4 py-3 text-sm text-muted">No SIT types defined yet — add one under Admin → Configuration → Sensitive Information Types.</div>}
            {allTypes.map((t) => {
              const sel = selected.some((s) => s.sitTypeId === t.sitTypeId);
              return (
                <button
                  key={t.sitTypeId}
                  type="button"
                  onClick={() => toggle(t)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-canvas-soft text-left transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-red-600" />
                  <span className="flex-1 text-[13px] font-medium text-ink">{t.sitName}</span>
                  {t.patternCount === 0 && <span className="text-[10px] text-muted shrink-0">no patterns</span>}
                  {sel && <svg className="w-3.5 h-3.5 text-brand-purple shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-2">
        <button onClick={runSuggest} disabled={suggesting} className="text-[11px] font-semibold text-brand-purple hover:underline disabled:opacity-50">
          {suggesting ? "Analyzing…" : "✨ Suggest a SIT value"}
        </button>
        {suggestions && (
          <div className="mt-1.5 space-y-1">
            {suggestions.length === 0 ? (
              <div className="text-[11px] text-muted">No SIT value's name pattern matched this term's name or linked columns.</div>
            ) : suggestions.slice(0, 5).map((s) => {
              const alreadySelected = selected.some((sel) => sel.sitTypeId === s.sitTypeId);
              return (
                <div key={s.sitTypeId} className="flex items-center gap-2 text-[11px] bg-canvas-soft border border-line-soft rounded-md px-2 py-1.5">
                  <span className="font-semibold text-ink">{s.sitName}</span>
                  <span className="text-muted">{(s.confidence * 100).toFixed(0)}% match</span>
                  <span className="text-muted truncate flex-1" title={s.evidence.join("; ")}>{s.evidence[0]}</span>
                  <button
                    onClick={() => applySuggestion(s)}
                    disabled={alreadySelected}
                    className="text-brand-purple font-semibold hover:underline disabled:opacity-40 disabled:no-underline shrink-0"
                  >
                    {alreadySelected ? "Added" : "+ Add"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
