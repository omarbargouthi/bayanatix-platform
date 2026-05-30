"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/lang-context";

const ENTITY_TYPE_OPTIONS_KEYS = [
  { value: "",              labelKey: "typeNone" as const },
  { value: "TRANSACTIONAL", labelKey: "typeTransactional" as const },
  { value: "MASTER",        labelKey: "typeMaster" as const },
  { value: "REFERENCE",     labelKey: "typeReference" as const },
  { value: "SYSTEM",        labelKey: "typeSystem" as const },
];

interface Props {
  entityId:          number;
  description:       string | null;
  sourceDescription: string | null;
  displayName:       string | null;
  category:          string | null;
  canEdit:           boolean;
}

export function TableEditPanel({ entityId, description, sourceDescription, displayName, category, canEdit }: Props) {
  const router = useRouter();
  const { t } = useLang();
  const c = t.catalog;

  const [editing,  setEditing]  = useState(false);
  const [desc,     setDesc]     = useState(description ?? "");
  const [dispName, setDispName] = useState(displayName ?? "");
  const [cat,      setCat]      = useState(category ?? "");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/catalog/entities/${entityId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ description: desc, displayName: dispName, category: cat || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "Unknown error" }));
        setError(d.error ?? "Failed to save");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDesc(description ?? "");
    setDispName(displayName ?? "");
    setCat(category ?? "");
    setEditing(false);
    setError(null);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold m-0">{c.descLabel}</h3>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="btn btn-sm">{t.common.edit}</button>
        )}
        {editing && (
          <div className="flex gap-2">
            <button onClick={cancel} className="btn btn-sm">{t.common.cancel}</button>
            <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
              {saving ? t.common.saving : t.common.save}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5 font-semibold">
              {c.editFriendlyName}
            </label>
            <input
              type="text"
              value={dispName}
              onChange={(e) => setDispName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-line rounded-md focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20"
              placeholder="Business-friendly name…"
            />
          </div>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={4}
            className="w-full px-3.5 py-2.5 text-sm border border-line rounded-md focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 resize-none"
            placeholder="Describe this table…"
          />
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5 font-semibold">
              {c.tableTypeLabel}
            </label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-line rounded-md focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20"
            >
              {ENTITY_TYPE_OPTIONS_KEYS.map((o) => (
                <option key={o.value} value={o.value}>{c[o.labelKey]}</option>
              ))}
            </select>
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>
      ) : (
        <p className="text-ink-soft text-[14px] leading-relaxed">
          {description ?? c.noDescYet}
        </p>
      )}

      <div className="mt-3 rounded-md bg-canvas-soft border border-line px-3.5 py-2.5">
        <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">
          {c.fromSourceSystem}
        </div>
        {sourceDescription
          ? <p className="text-[13px] text-ink-soft leading-relaxed">{sourceDescription}</p>
          : <p className="text-[13px] text-muted italic">{c.noCommentSrc}</p>
        }
      </div>
    </>
  );
}
