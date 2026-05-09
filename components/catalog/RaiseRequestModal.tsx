"use client";

import { useState } from "react";
import type { RequestTypeCode, RequestPriority } from "@/lib/types";

interface Target {
  assetTypeCode: string;
  assetId:       number;
  assetName:     string;
}

const REQUEST_TYPES: { code: RequestTypeCode; label: string; desc: string; icon: string }[] = [
  { code: "FIX_DATA_ISSUE",    label: "Fix Data Issue",       desc: "Report incorrect, missing, or duplicate data values",      icon: "🔧" },
  { code: "UPDATE_DEFINITION", label: "Update Definition",    desc: "Request changes to descriptions, terms, or classifications", icon: "📝" },
  { code: "CERTIFY_ASSET",     label: "Certify Asset",        desc: "Request certification review for metadata or data quality", icon: "🏅" },
  { code: "GRANT_ACCESS",      label: "Grant Data Access",    desc: "Request read or write permissions to this dataset",         icon: "🔓" },
  { code: "REMOVE_ACCESS",     label: "Remove Data Access",   desc: "Request revocation of access permissions",                  icon: "🔒" },
  { code: "OTHER",             label: "Other",                desc: "General request or question about this data asset",         icon: "💬" },
];

const PRIORITY_OPTIONS: { code: RequestPriority; label: string; desc: string; color: string }[] = [
  { code: "HIGH",   label: "High",   desc: "Urgent — impacts production or compliance",   color: "border-red-400    bg-red-50    text-red-700"   },
  { code: "MEDIUM", label: "Medium", desc: "Important — should be addressed this sprint", color: "border-amber-400  bg-amber-50  text-amber-700" },
  { code: "LOW",    label: "Low",    desc: "Nice to have — can wait for the next cycle",  color: "border-gray-300   bg-gray-50   text-gray-600"  },
];

export function RaiseRequestModal({
  prefilledTarget,
  entities,
  onClose,
  onSaved,
}: {
  prefilledTarget?: Target;
  entities?:        { entityId: number; entityName: string }[];
  onClose:          () => void;
  onSaved:          () => void;
}) {
  const [requestType,  setRequestType]  = useState<RequestTypeCode | "">("");
  const [priority,     setPriority]     = useState<RequestPriority>("MEDIUM");
  const [title,        setTitle]        = useState("");
  const [description,  setDescription]  = useState("");
  const [targets,      setTargets]      = useState<Target[]>(prefilledTarget ? [prefilledTarget] : []);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Additional entity targets from the same schema
  const availableEntities = (entities ?? []).filter(
    (e) => !targets.some((t) => t.assetTypeCode === "DATA_ENTITIES" && t.assetId === e.entityId)
  );

  function addEntityTarget(e: { entityId: number; entityName: string }) {
    setTargets((prev) => [...prev, { assetTypeCode: "DATA_ENTITIES", assetId: e.entityId, assetName: e.entityName }]);
  }

  function removeTarget(idx: number) {
    setTargets((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!requestType) { setError("Please select a request type"); return; }
    if (!title.trim())  { setError("Please enter a title"); return; }
    if (targets.length === 0) { setError("At least one target asset is required"); return; }

    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestTypeCode: requestType,
          title: title.trim(),
          descriptionText: description.trim() || null,
          priorityCode: priority,
          targets,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "Unknown error" }));
        setError(d.error ?? "Failed to submit");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line sticky top-0 bg-white z-10">
          <h2 className="font-bold text-brand-deep">Raise a Request</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Request type */}
          <div>
            <label className="field-label">Request Type</label>
            <div className="grid grid-cols-2 gap-2">
              {REQUEST_TYPES.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => { setRequestType(t.code); if (!title) setTitle(t.label); }}
                  className={`text-left px-3 py-2.5 rounded-lg border-2 transition-colors ${
                    requestType === t.code
                      ? "border-brand-purple bg-brand-purple/5"
                      : "border-line hover:border-brand-purple/40"
                  }`}
                >
                  <div className="text-base leading-none mb-1">{t.icon}</div>
                  <div className="text-[12px] font-semibold text-brand-deep">{t.label}</div>
                  <div className="text-[10px] text-muted mt-0.5 leading-tight">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="field-label">Priority</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setPriority(p.code)}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 text-[12px] font-bold transition-colors ${
                    priority === p.code
                      ? p.color + " ring-2 ring-offset-1 ring-brand-purple/30"
                      : "border-line bg-white text-ink hover:border-brand-purple/30"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-1">
              {PRIORITY_OPTIONS.find((p) => p.code === priority)?.desc}
            </p>
          </div>

          {/* Title */}
          <div>
            <label className="field-label">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="Brief description of the request…"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="field-label">Details <span className="text-muted font-normal normal-case">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-field resize-none"
              placeholder="Provide context, steps to reproduce, or expected behaviour…"
            />
          </div>

          {/* Target assets */}
          <div>
            <label className="field-label">Target Assets</label>
            <div className="space-y-1.5 mb-2">
              {targets.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-canvas border border-line rounded-lg">
                  <span className="text-[10px] uppercase tracking-wider text-muted w-16 shrink-0">
                    {t.assetTypeCode.replace("DATA_", "")}
                  </span>
                  <span className="text-[12px] font-mono font-semibold text-brand-deep flex-1 truncate">{t.assetName}</span>
                  {targets.length > 1 && (
                    <button onClick={() => removeTarget(idx)} className="text-muted hover:text-red-500 text-sm leading-none">&times;</button>
                  )}
                </div>
              ))}
            </div>

            {/* Add more tables from same schema */}
            {availableEntities.length > 0 && (
              <details className="text-[12px]">
                <summary className="cursor-pointer text-brand-purple hover:underline select-none">
                  + Add another table from this schema
                </summary>
                <div className="mt-2 border border-line rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {availableEntities.map((e) => (
                    <button
                      key={e.entityId}
                      onClick={() => addEntityTarget(e)}
                      className="w-full text-left px-3 py-2 text-[12px] font-mono hover:bg-canvas-soft border-b border-line-soft last:border-0"
                    >
                      {e.entityName}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary">
            {saving ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
