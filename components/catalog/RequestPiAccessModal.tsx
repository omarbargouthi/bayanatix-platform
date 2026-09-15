"use client";

import { useState } from "react";

interface Props {
  entityId:   number;
  entityName: string;
  onClose:    () => void;
  onSubmitted: () => void;
}

export function RequestPiAccessModal({ entityId, entityName, onClose, onSubmitted }: Props) {
  const [purpose, setPurpose] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function submit() {
    if (!purpose.trim()) { setError("Purpose of use is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestTypeCode: "PI_CLEAR_TEXT_ACCESS",
          title: `PI clear-text access: ${entityName}`,
          descriptionText: purpose.trim(),
          priorityCode: "MEDIUM",
          targets: [{ assetTypeCode: "DATA_ENTITIES", assetId: entityId, assetName: entityName }],
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "Failed" }));
        setError(d.error ?? "Failed to submit request");
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
            <h2 className="font-bold text-brand-deep">Request PI Clear-Text Access</h2>
            <p className="text-[11px] text-muted font-mono mt-0.5">{entityName}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-[12px] text-muted">
            Viewing PI/PII columns as clear text requires approval from Admin, the Data Privacy Officer, and DMO
            Manager. State the business purpose for this request.
          </p>
          <div>
            <label className="field-label">Purpose of Use <span className="text-red-500">*</span></label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={4}
              autoFocus
              className="input-field resize-none"
              placeholder="Why do you need to see this table's PI/PII columns unmasked?"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={onClose} className="btn btn-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
