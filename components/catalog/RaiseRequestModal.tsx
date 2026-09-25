"use client";

import { useState } from "react";
import type { RequestTypeCode, RequestPriority } from "@/lib/types";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";

interface Target {
  assetTypeCode: string;
  assetId:       number;
  assetName:     string;
}

function buildRequestTypes(c: I18nStrings["catalog"]): { code: RequestTypeCode; label: string; desc: string; icon: string }[] {
  return [
    { code: "FIX_DATA_ISSUE",    label: c.reqTypeFixDataIssue,      desc: c.reqTypeFixDataIssueDesc,      icon: "🔧" },
    { code: "UPDATE_DEFINITION", label: c.reqTypeUpdateDefinition,  desc: c.reqTypeUpdateDefinitionDesc,  icon: "📝" },
    { code: "CERTIFY_ASSET",     label: c.reqTypeCertifyAsset,      desc: c.reqTypeCertifyAssetDesc,      icon: "🏅" },
    { code: "GRANT_ACCESS",      label: c.reqTypeGrantAccess,       desc: c.reqTypeGrantAccessDesc,       icon: "🔓" },
    { code: "REMOVE_ACCESS",     label: c.reqTypeRemoveAccess,      desc: c.reqTypeRemoveAccessDesc,      icon: "🔒" },
    { code: "OTHER",             label: c.reqTypeOther,             desc: c.reqTypeOtherDesc,             icon: "💬" },
  ];
}

function buildPriorityOptions(c: I18nStrings["catalog"]): { code: RequestPriority; label: string; desc: string; color: string }[] {
  return [
    { code: "HIGH",   label: c.priorityHigh,   desc: c.priorityHighDesc,   color: "border-red-400    bg-red-50    text-red-700"   },
    { code: "MEDIUM", label: c.priorityMedium, desc: c.priorityMediumDesc, color: "border-amber-400  bg-amber-50  text-amber-700" },
    { code: "LOW",    label: c.priorityLow,    desc: c.priorityLowDesc,    color: "border-gray-300   bg-gray-50   text-gray-600"  },
  ];
}

export function RaiseRequestModal({
  prefilledTarget,
  entities,
  initialRequestType,
  onClose,
  onSaved,
}: {
  prefilledTarget?:     Target;
  entities?:            { entityId: number; entityName: string }[];
  initialRequestType?:  RequestTypeCode;
  onClose:              () => void;
  onSaved:              () => void;
}) {
  const { t } = useLang();
  const c = t.catalog;
  const REQUEST_TYPES = buildRequestTypes(c);
  const PRIORITY_OPTIONS = buildPriorityOptions(c);
  const [requestType,  setRequestType]  = useState<RequestTypeCode | "">(initialRequestType ?? "");
  const [priority,     setPriority]     = useState<RequestPriority>("MEDIUM");
  const [title,        setTitle]        = useState(
    initialRequestType ? REQUEST_TYPES.find((rt) => rt.code === initialRequestType)?.label ?? "" : ""
  );
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
    if (!requestType) { setError(c.selectRequestTypeErr); return; }
    if (!title.trim())  { setError(c.enterTitleErr); return; }
    if (targets.length === 0) { setError(c.targetRequiredErr); return; }

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
        const d = await r.json().catch(() => ({ error: c.unknownErr }));
        setError(d.error ?? c.submitRequestFailed);
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
          <h2 className="font-bold text-brand-deep">{c.raiseRequestTitle}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Request type */}
          <div>
            <label className="field-label">{c.requestTypeLabel}</label>
            <div className="grid grid-cols-2 gap-2">
              {REQUEST_TYPES.map((rt) => (
                <button
                  key={rt.code}
                  type="button"
                  onClick={() => { setRequestType(rt.code); if (!title) setTitle(rt.label); }}
                  className={`text-left px-3 py-2.5 rounded-lg border-2 transition-colors ${
                    requestType === rt.code
                      ? "border-brand-purple bg-brand-purple/5"
                      : "border-line hover:border-brand-purple/40"
                  }`}
                >
                  <div className="text-base leading-none mb-1">{rt.icon}</div>
                  <div className="text-[12px] font-semibold text-brand-deep">{rt.label}</div>
                  <div className="text-[10px] text-muted mt-0.5 leading-tight">{rt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="field-label">{c.priorityLabel}</label>
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
            <label className="field-label">{c.titleLabel}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder={c.titlePlaceholder}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="field-label">{c.detailsLabel} <span className="text-muted font-normal normal-case">{c.detailsOptional}</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-field resize-none"
              placeholder={c.detailsPlaceholder}
            />
          </div>

          {/* Target assets */}
          <div>
            <label className="field-label">{c.targetAssetsLabel}</label>
            <div className="space-y-1.5 mb-2">
              {targets.map((tg, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-canvas border border-line rounded-lg">
                  <span className="text-[10px] uppercase tracking-wider text-muted w-16 shrink-0">
                    {tg.assetTypeCode.replace("DATA_", "")}
                  </span>
                  <span className="text-[12px] font-mono font-semibold text-brand-deep flex-1 truncate">{tg.assetName}</span>
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
                  {c.addAnotherTable}
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
          <button onClick={onClose} className="btn">{t.common.cancel}</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary">
            {saving ? t.common.submitting : c.submitRequestBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
