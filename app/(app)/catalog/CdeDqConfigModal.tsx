"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/lang-context";

type DimensionRow = { dimensionCode: string; label: string; weight: number; isEnabled: boolean };

export function CdeDqConfigModal({
  dimensions, onClose,
}: {
  dimensions: DimensionRow[];
  onClose: () => void;
}) {
  const { t } = useLang();
  const c = t.catalog;
  const router = useRouter();
  const [rows, setRows] = useState<DimensionRow[]>(dimensions.map((d) => ({ ...d })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(code: string, patch: Partial<DimensionRow>) {
    setRows((prev) => prev.map((r) => (r.dimensionCode === code ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/catalog/cde-dq-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: rows.map((r) => ({ dimensionCode: r.dimensionCode, weight: r.weight, isEnabled: r.isEnabled })),
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "Failed" }));
        setError(d.error ?? "Failed to save");
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-line max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-bold text-brand-deep">{c.dqConfigTitle}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-[12px] text-muted">{c.dqConfigDesc}</p>

          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2.5">
            <span className="text-[11px] font-semibold text-muted">{c.dqIncluded}</span>
            <span />
            <span className="text-[11px] font-semibold text-muted text-right">{c.dqWeight}</span>
            {rows.map((r) => (
              <Fragment key={r.dimensionCode}>
                <input
                  type="checkbox"
                  checked={r.isEnabled}
                  onChange={(e) => updateRow(r.dimensionCode, { isEnabled: e.target.checked })}
                />
                <span className="text-sm text-ink">{r.label}</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={r.weight}
                  onChange={(e) => updateRow(r.dimensionCode, { weight: Number(e.target.value) })}
                  className="input-field w-20 text-right text-[12px]"
                />
              </Fragment>
            ))}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? t.common.saving : t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}
