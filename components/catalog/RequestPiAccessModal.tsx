"use client";

import { useState } from "react";
import { useLang } from "@/lib/lang-context";

interface Props {
  entityId:   number;
  entityName: string;
  onClose:    () => void;
  onSubmitted: () => void;
}

export function RequestPiAccessModal({ entityId, entityName, onClose, onSubmitted }: Props) {
  const { t } = useLang();
  const c = t.catalog;
  const [purpose,    setPurpose]    = useState("");
  const [legalBasis, setLegalBasis] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function submit() {
    if (!purpose.trim()) { setError(c.purposeRequiredErr); return; }
    if (!legalBasis.trim()) { setError(c.legalBasisRequiredErr); return; }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/pi-access/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId, entityName,
          purpose: purpose.trim(),
          legalBasis: legalBasis.trim(),
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: c.piAccessSubmitFailed }));
        setError(d.error ?? c.piAccessSubmitFailed);
        return;
      }
      onSubmitted();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div>
            <h2 className="font-bold text-brand-deep">{c.piAccessTitle}</h2>
            <p className="text-[11px] text-muted font-mono mt-0.5">{entityName}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-[12px] text-muted">
            {c.piAccessDesc}
          </p>
          <div>
            <label className="field-label">{c.purposeLabel} <span className="text-red-500">*</span></label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              autoFocus
              className="input-field resize-none"
              placeholder={c.purposePlaceholder}
            />
          </div>
          <div>
            <label className="field-label">{c.legalBasisLabel} <span className="text-red-500">*</span></label>
            <textarea
              value={legalBasis}
              onChange={(e) => setLegalBasis(e.target.value)}
              rows={2}
              className="input-field resize-none"
              placeholder={c.legalBasisPlaceholder}
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? t.common.submitting : c.submitRequestBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
