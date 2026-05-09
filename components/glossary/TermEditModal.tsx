"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GlossaryTermDetail, GlossaryAlias } from "@/lib/types";

const CLASSIFICATION_OPTIONS = [
  { value: "",            label: "— None —" },
  { value: "PUBLIC",      label: "Public" },
  { value: "CONFIDENTIAL",label: "Confidential" },
  { value: "SECRET",      label: "Secret" },
  { value: "TOP_SECRET",  label: "Top Secret" },
];

const PI_CATEGORY_OPTIONS = [
  { value: "",          label: "— None —" },
  { value: "PERSONAL",  label: "Personal Information" },
  { value: "HEALTH",    label: "Health Information" },
  { value: "FINANCIAL", label: "Financial Information" },
  { value: "CONTACT",   label: "Contact Information" },
];

const TERM_TYPE_OPTIONS = [
  { value: "TERM",       label: "Term" },
  { value: "KPI_METRIC", label: "KPI / Metric" },
];

interface Props {
  term:    GlossaryTermDetail;
  onClose: () => void;
}

export function TermEditModal({ term, onClose }: Props) {
  const router = useRouter();

  // Form fields
  const [definition,    setDefinition]    = useState(term.definition    ?? "");
  const [format,        setFormat]        = useState(term.format        ?? "");
  const [businessRules, setBusinessRules] = useState(term.businessRules ?? "");
  const [classCode,     setClassCode]     = useState(term.classCode     ?? "");
  const [isPii,         setIsPii]         = useState(term.isPii         ?? false);
  const [piCategory,    setPiCategory]    = useState(term.piCategory    ?? "");
  const [example,       setExample]       = useState(term.example       ?? "");
  const [termType,      setTermType]      = useState(term.termType      ?? "TERM");

  // Alias management (local state, committed on Save)
  const [aliases,    setAliases]    = useState<GlossaryAlias[]>(term.aliases);
  const [newAlias,   setNewAlias]   = useState("");
  const [nextTempId, setNextTempId] = useState(-1); // negative = new alias not yet in DB

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  function addAliasLocal() {
    const name = newAlias.trim();
    if (!name || aliases.some((a) => a.name.toLowerCase() === name.toLowerCase())) return;
    setAliases((prev) => [...prev, { aliasId: nextTempId, name }]);
    setNextTempId((n) => n - 1);
    setNewAlias("");
  }

  function removeAliasLocal(aliasId: number) {
    setAliases((prev) => prev.filter((a) => a.aliasId !== aliasId));
  }

  async function save() {
    if (!definition.trim()) { setError("Definition is required."); return; }
    setSaving(true);
    setError(null);
    try {
      // 1. PATCH the term fields
      const r = await fetch(`/api/glossary/terms/${term.glossaryId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          definition: definition.trim(),
          format,
          businessRules,
          classCode: classCode || null,
          isPii,
          piCategory: piCategory || null,
          example,
          termType,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "Unknown error" }));
        setError(d.error ?? "Failed to save term");
        return;
      }

      // 2. Delete removed aliases (those in original that are no longer in local state)
      const localIds = new Set(aliases.map((a) => a.aliasId));
      const deletedAliases = term.aliases.filter((a) => !localIds.has(a.aliasId));
      await Promise.all(
        deletedAliases.map((a) =>
          fetch(`/api/glossary/terms/${term.glossaryId}/aliases/${a.aliasId}`, { method: "DELETE" })
        )
      );

      // 3. Add new aliases (those with negative aliasId = not yet in DB)
      const newAliases = aliases.filter((a) => a.aliasId < 0);
      await Promise.all(
        newAliases.map((a) =>
          fetch(`/api/glossary/terms/${term.glossaryId}/aliases`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ name: a.name }),
          })
        )
      );

      onClose();
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-line flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <h2 className="font-bold text-brand-deep">Edit: {term.termName}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">

          {/* Term Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Term Type</label>
              <select value={termType} onChange={(e) => setTermType(e.target.value)} className="input-field">
                {TERM_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Classification</label>
              <select value={classCode} onChange={(e) => setClassCode(e.target.value)} className="input-field">
                {CLASSIFICATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Definition */}
          <div>
            <label className="field-label">Definition <span className="text-red-500">*</span></label>
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              rows={4}
              className="input-field resize-none"
              placeholder="Business definition of this term…"
            />
          </div>

          {/* Business Rules */}
          <div>
            <label className="field-label">Business Rules</label>
            <textarea
              value={businessRules}
              onChange={(e) => setBusinessRules(e.target.value)}
              rows={3}
              className="input-field resize-none"
              placeholder="e.g. Invoice amount must be positive. Tax is calculated at 15%."
            />
          </div>

          {/* Format + Example */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Format</label>
              <input
                type="text"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="input-field"
                placeholder="e.g. YYYY-MM-DD or #,##0.00"
              />
            </div>
            <div>
              <label className="field-label">Example</label>
              <input
                type="text"
                value={example}
                onChange={(e) => setExample(e.target.value)}
                className="input-field"
                placeholder="e.g. 2024-01-15"
              />
            </div>
          </div>

          {/* PII + PI Category */}
          <div className="grid grid-cols-2 gap-4 items-end">
            <div>
              <label className="field-label">PI Category</label>
              <select
                value={piCategory}
                onChange={(e) => setPiCategory(e.target.value)}
                disabled={!isPii}
                className="input-field disabled:opacity-50"
              >
                {PI_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2.5 pb-2.5">
              <input
                type="checkbox"
                id="term-is-pii"
                checked={isPii}
                onChange={(e) => {
                  setIsPii(e.target.checked);
                  if (!e.target.checked) setPiCategory("");
                }}
                className="w-4 h-4 rounded accent-brand-purple"
              />
              <label htmlFor="term-is-pii" className="text-sm text-ink cursor-pointer select-none">
                PII Flag — Contains personal data
              </label>
            </div>
          </div>

          {/* Synonyms / Aliases */}
          <div>
            <label className="field-label">Synonyms</label>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
              {aliases.map((a) => (
                <span
                  key={a.aliasId}
                  className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple border border-brand-purple/20"
                >
                  {a.name}
                  <button
                    onClick={() => removeAliasLocal(a.aliasId)}
                    className="hover:text-red-600 leading-none ml-0.5 font-bold"
                    title="Remove synonym"
                  >
                    ×
                  </button>
                </span>
              ))}
              {aliases.length === 0 && (
                <span className="text-[12px] text-muted">No synonyms yet</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAliasLocal(); }}}
                className="input-field flex-1"
                placeholder="Add a synonym and press Enter or +"
              />
              <button
                onClick={addAliasLocal}
                className="btn btn-sm px-4"
                disabled={!newAlias.trim()}
              >
                + Add
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-line shrink-0">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
