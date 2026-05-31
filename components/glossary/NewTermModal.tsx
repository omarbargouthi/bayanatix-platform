"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GlossaryDomain } from "@/lib/types";
import { useLang } from "@/lib/lang-context";

const CLASSIFICATION_OPTIONS = [
  { value: "",             labelKey: "classNone" as const },
  { value: "PUBLIC",       labelKey: "classPublic" as const },
  { value: "CONFIDENTIAL", labelKey: "classConfidential" as const },
  { value: "RESTRICTED",   labelKey: "classRestricted" as const },
  { value: "SECRET",       labelKey: "classSecret" as const },
];

const TERM_TYPE_OPTIONS = [
  { value: "TERM",       labelKey: "termTypeTerm" as const },
  { value: "KPI_METRIC", labelKey: "termTypeKpi" as const },
];

interface Props {
  domains: GlossaryDomain[];
  onClose: () => void;
}

export function NewTermModal({ domains, onClose }: Props) {
  const router = useRouter();
  const { t } = useLang();
  const g = t.glossary;
  const c = t.catalog;

  const [termName,       setTermName]       = useState("");
  const [domainId,       setDomainId]       = useState(domains[0]?.glossaryId ? String(domains[0].glossaryId) : "");
  const [definition,     setDefinition]     = useState("");
  const [termType,       setTermType]       = useState("TERM");
  const [classCode,      setClassCode]      = useState("");
  const [isPii,          setIsPii]          = useState(false);
  const [businessRules,  setBusinessRules]  = useState("");
  const [format,         setFormat]         = useState("");
  const [example,        setExample]        = useState("");
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  async function create() {
    if (!termName.trim())  { setError("Term name is required.");  return; }
    if (!domainId)         { setError("Domain is required.");     return; }
    if (!definition.trim()){ setError("Definition is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/glossary/terms", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          termName: termName.trim(),
          parentGlossaryId: Number(domainId),
          definition: definition.trim(),
          termType,
          classCode: classCode || null,
          isPii,
          format: format || null,
          businessRules: businessRules || null,
          example: example || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "Unknown error" }));
        setError(d.error ?? "Failed to create term");
        return;
      }
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
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl border border-line flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <h2 className="font-bold text-brand-deep">{g.newTermModalTitle}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          <div>
            <label className="field-label">{g.termNameLabel}</label>
            <input
              type="text"
              autoFocus
              value={termName}
              onChange={(e) => setTermName(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="field-label">{g.domainLabel}</label>
            <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className="input-field">
              <option value="">—</option>
              {domains.map((d) => (
                <option key={d.glossaryId} value={d.glossaryId}>{d.termName}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">{g.propTermType}</label>
              <select value={termType} onChange={(e) => setTermType(e.target.value)} className="input-field">
                {TERM_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{g[o.labelKey]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">{g.propPii}</label>
              <div className="flex items-center gap-2.5 h-[38px]">
                <input
                  type="checkbox"
                  checked={isPii}
                  onChange={(e) => setIsPii(e.target.checked)}
                  className="w-4 h-4 rounded accent-brand-purple"
                />
                <span className="text-sm text-ink">PII</span>
              </div>
            </div>
          </div>

          <div>
            <label className="field-label">{g.colClassification}</label>
            <select value={classCode} onChange={(e) => setClassCode(e.target.value)} className="input-field">
              <option value="">— None —</option>
              {CLASSIFICATION_OPTIONS.slice(1).map((o) => (
                <option key={o.value} value={o.value}>{(c as Record<string, string>)[o.labelKey]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">{g.termDefLabel}</label>
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              rows={3}
              className="input-field resize-none"
            />
          </div>

          <div>
            <label className="field-label">{g.sectionBizRules}</label>
            <textarea
              value={businessRules}
              onChange={(e) => setBusinessRules(e.target.value)}
              rows={2}
              className="input-field resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">{g.formatLabel}</label>
              <input type="text" value={format} onChange={(e) => setFormat(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="field-label">{g.exampleValue}</label>
              <input type="text" value={example} onChange={(e) => setExample(e.target.value)} className="input-field" />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-line shrink-0">
          <button onClick={onClose} className="btn">{t.common.cancel}</button>
          <button onClick={create} disabled={saving} className="btn btn-primary">
            {saving ? g.creating : g.newTerm}
          </button>
        </div>
      </div>
    </div>
  );
}
