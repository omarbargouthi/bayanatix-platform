"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ENTITY_TYPE_OPTIONS = [
  { value: "",              label: "— None —" },
  { value: "TRANSACTIONAL", label: "Transactional" },
  { value: "MASTER",        label: "Master" },
  { value: "REFERENCE",     label: "Lookup / Reference" },
  { value: "SYSTEM",        label: "System / Setup" },
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
  const [editing,     setEditing]     = useState(false);
  const [desc,        setDesc]        = useState(description ?? "");
  const [dispName,    setDispName]    = useState(displayName ?? "");
  const [cat,         setCat]         = useState(category ?? "");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

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
        <h3 className="font-bold m-0">Description</h3>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="btn btn-sm">Edit</button>
        )}
        {editing && (
          <div className="flex gap-2">
            <button onClick={cancel} className="btn btn-sm">Cancel</button>
            <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5 font-semibold">
              Friendly Name
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
              Table Type
            </label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-line rounded-md focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20"
            >
              {ENTITY_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
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
          {description ?? "No description provided yet."}
        </p>
      )}

      {sourceDescription && (
        <div className="mt-3 rounded-md bg-canvas-soft border border-line px-3.5 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">
            From source system
          </div>
          <p className="text-[13px] text-ink-soft leading-relaxed">{sourceDescription}</p>
        </div>
      )}
    </>
  );
}
