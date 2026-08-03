"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/lang-context";

// AI-suggest / rephrase widget for a table or column description (spec §2.2).
// Suggestion text is always editable before Accept; every suggestion is visibly
// labeled as AI-derived until a steward accepts it (spec §5.5) — the accept action
// writes straight to the official field via /api/enrichment/descriptions/{id}/accept,
// independent of whatever manual edit panel also lives on the page.
export function DescriptionEnrichWidget({
  assetType, assetId, currentText, canEdit,
}: {
  assetType: "DATA_ENTITIES" | "DATA_ATTRIBUTES";
  assetId: number;
  currentText: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { t, lang: uiLang } = useLang();
  const e = t.enrichment;

  type Variant = { suggestionId: number; text: string };
  type LangPref = "auto" | "en" | "ar";
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [mode, setMode] = useState<"GENERATE" | "REPHRASE">("GENERATE");
  const [activeIdx, setActiveIdx] = useState(0);
  const [editedText, setEditedText] = useState("");
  const [rationale, setRationale] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [langPref, setLangPref] = useState<LangPref>("auto");

  if (!canEdit) return null;

  // "Auto" follows whatever language the app's own language toggle is currently
  // set to — the description/rephrase backend only speaks English/Arabic, so any
  // non-English UI language maps to Arabic here.
  const effectiveLang: "en" | "ar" = langPref === "auto" ? (uiLang === "en" ? "en" : "ar") : langPref;

  async function suggest() {
    setBusy(true); setError(null); setOpen(true);
    try {
      const res = await fetch(`/api/assets/${assetType}/${assetId}/description/suggest`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: effectiveLang }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setMode("GENERATE");
      setVariants([{ suggestionId: data.suggestionId, text: data.suggestedText }]);
      setActiveIdx(0);
      setEditedText(data.suggestedText);
      setRationale(data.rationale?.signals ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function rephrase() {
    setBusy(true); setError(null); setOpen(true);
    try {
      const res = await fetch(`/api/assets/${assetType}/${assetId}/description/rephrase`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: effectiveLang }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      const vs: Variant[] = data.variants.map((v: { suggestionId: number; text: string }) => ({ suggestionId: v.suggestionId, text: v.text }));
      setMode("REPHRASE");
      setVariants(vs);
      setActiveIdx(0);
      setEditedText(vs[0]?.text ?? "");
      setRationale(null);
    } finally {
      setBusy(false);
    }
  }

  function switchVariant(i: number) {
    if (!variants) return;
    setActiveIdx(i);
    setEditedText(variants[i].text);
  }

  async function accept() {
    if (!variants) return;
    setBusy(true); setError(null);
    try {
      const suggestionId = variants[activeIdx].suggestionId;
      const edited = editedText.trim() !== variants[activeIdx].text.trim();
      const res = await fetch(`/api/enrichment/descriptions/${suggestionId}/accept`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edited ? { final_text: editedText.trim() } : {}),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Failed to accept"); return; }
      close();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!variants) { close(); return; }
    setBusy(true);
    try {
      await Promise.all(variants.map((v) => fetch(`/api/enrichment/descriptions/${v.suggestionId}/discard`, { method: "POST" })));
    } finally {
      setBusy(false);
      close();
    }
  }

  function close() {
    setOpen(false); setVariants(null); setRationale(null); setError(null);
  }

  return (
    <div className="mt-2">
      {!open && (
        <div className="flex items-center gap-3">
          <button onClick={suggest} disabled={busy} className="text-[11px] font-semibold text-brand-purple hover:underline disabled:opacity-50">
            {busy ? e.suggesting : e.suggest}
          </button>
          {currentText?.trim() && (
            <button onClick={rephrase} disabled={busy} className="text-[11px] font-medium text-muted hover:text-ink hover:underline disabled:opacity-50">
              {busy ? e.rephrasing : e.rephrase}
            </button>
          )}
          <select
            value={langPref}
            onChange={(ev) => setLangPref(ev.target.value as LangPref)}
            disabled={busy}
            title={e.langLabel}
            className="text-[10px] border border-line rounded px-1.5 py-0.5 bg-white text-muted focus:outline-none focus:border-brand-purple"
          >
            <option value="auto">{e.langAuto}</option>
            <option value="en">{e.langEnglish}</option>
            <option value="ar">{e.langArabic}</option>
          </select>
        </div>
      )}

      {open && (
        <div className="mt-2 bg-white border border-line rounded-lg p-3 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-dashed border-amber-400 bg-amber-50 text-amber-700">
              ✨ {e.aiPendingLabel}
            </span>
            <select
              value={langPref}
              onChange={(ev) => setLangPref(ev.target.value as LangPref)}
              disabled={busy}
              title={e.langLabel}
              className="text-[10px] border border-line rounded px-1.5 py-0.5 bg-white text-muted focus:outline-none focus:border-brand-purple"
            >
              <option value="auto">{e.langAuto}</option>
              <option value="en">{e.langEnglish}</option>
              <option value="ar">{e.langArabic}</option>
            </select>
            {variants && variants.length > 1 && (
              <div className="flex items-center gap-1">
                {variants.map((_, i) => (
                  <button
                    key={i} onClick={() => switchVariant(i)}
                    className={`text-[10px] font-semibold w-5 h-5 rounded-full border ${i === activeIdx ? "bg-brand-purple text-white border-brand-purple" : "text-muted border-line hover:border-brand-purple"}`}
                    title={`${e.variantLabel} ${i + 1}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">{e.errorPrefix}: {error}</div>}

          {variants && (
            <>
              <textarea
                value={editedText}
                onChange={(ev) => setEditedText(ev.target.value)}
                rows={3}
                className="w-full px-2.5 py-2 text-[13px] border border-line rounded-md focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 resize-none"
              />
              {rationale && rationale.length > 0 && (
                <div className="text-[11px] text-muted">
                  <span className="font-semibold">{e.rationaleLabel}:</span> {rationale.join(", ")}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={accept} disabled={busy || !editedText.trim()} className="text-[11px] font-semibold text-white bg-brand-purple rounded px-2.5 py-1 disabled:opacity-40">
                  {editedText.trim() !== variants[activeIdx].text.trim() ? e.editThenAccept : e.accept}
                </button>
                <button onClick={mode === "REPHRASE" ? rephrase : suggest} disabled={busy} className="text-[11px] font-medium text-muted hover:text-ink">
                  {e.regenerate}
                </button>
                <button onClick={discard} disabled={busy} className="text-[11px] font-medium text-red-600 hover:underline">
                  {e.discard}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
