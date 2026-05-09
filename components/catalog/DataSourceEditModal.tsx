"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DataSource } from "@/lib/types";
import { AssetHistoryDrawer } from "./AssetHistoryDrawer";
import { TagPicker } from "./TagPicker";
import { TermMultiPicker } from "./TermMultiPicker";

export function DataSourceEditModal({
  source,
  onClose,
}: {
  source:  DataSource;
  onClose: () => void;
}) {
  const router = useRouter();
  const [description,    setDescription]    = useState(source.description    ?? "");
  const [businessAppName,setBusinessAppName]= useState(source.businessAppName ?? "");
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [showHistory,    setShowHistory]    = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/catalog/sources/${source.dataSourceId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ description, businessAppName }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "Unknown error" }));
        setError(d.error ?? "Failed to save");
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
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-line">
            <div>
              <h2 className="font-bold text-brand-deep">Edit Data Source</h2>
              <p className="text-[11px] text-muted">{source.sourceName} · {source.sourceType}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(true)}
                className="text-[11px] text-brand-purple hover:underline font-medium"
              >
                View History
              </button>
              <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none ml-2">&times;</button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="field-label">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="input-field resize-none"
                placeholder="Describe this data source…"
              />
            </div>
            <div>
              <label className="field-label">Business Application</label>
              <input
                type="text"
                value={businessAppName}
                onChange={(e) => setBusinessAppName(e.target.value)}
                className="input-field"
                placeholder="e.g. Oracle ERP, Salesforce CRM…"
              />
              <p className="text-[11px] text-muted mt-1">
                The business system that owns or produces this data.
              </p>
            </div>
            <div>
              <label className="field-label">Tags</label>
              <TagPicker assetType="DATA_SOURCES" assetId={source.dataSourceId} />
            </div>
            <div>
              <label className="field-label">Business Terms</label>
              <TermMultiPicker assetType="DATA_SOURCES" assetId={source.dataSourceId} />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
            <button onClick={onClose} className="btn">Cancel</button>
            <button onClick={save} disabled={saving} className="btn btn-primary">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {showHistory && (
        <AssetHistoryDrawer
          assetType="DATA_SOURCES"
          assetId={source.dataSourceId}
          assetName={source.sourceName}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
}
