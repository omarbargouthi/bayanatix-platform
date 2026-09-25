"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";

type CertLevel = "GOLD" | "SILVER" | "BRONZE";

interface DimState {
  certTypeCode: string | null;
  certDate:     string | null;
  certifiedBy:  string | null;
  notes:        string | null;
}

interface Props {
  assetType: string;
  assetId:   number | string;
  assetName: string;
  onClose:   () => void;
  onSaved?:  () => void;
}

function buildLevels(c: I18nStrings["catalog"]): { code: CertLevel; label: string; color: string; badge: string }[] {
  return [
    { code: "GOLD",   label: c.levelGold,   color: "border-yellow-400 bg-yellow-50 text-yellow-700",  badge: "bg-yellow-400" },
    { code: "SILVER", label: c.levelSilver, color: "border-gray-400  bg-gray-50  text-gray-600",      badge: "bg-gray-400"   },
    { code: "BRONZE", label: c.levelBronze, color: "border-orange-400 bg-orange-50 text-orange-700",  badge: "bg-orange-400" },
  ];
}

function DimPanel({
  title,
  subtitle,
  dimension,
  assetType,
  assetId,
  initial,
  onRefresh,
}: {
  title:     string;
  subtitle:  string;
  dimension: "METADATA" | "DATA";
  assetType: string;
  assetId:   number | string;
  initial:   DimState | null;
  onRefresh: () => void;
}) {
  const { t } = useLang();
  const c = t.catalog;
  const LEVELS = buildLevels(c);
  const [notes,   setNotes]   = useState(initial?.notes ?? "");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const current = initial?.certTypeCode ?? null;

  async function setCert(level: CertLevel) {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/assets/${assetType}/${assetId}/certify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimension, certTypeCode: level, notes: notes.trim() || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: c.certSaveFailed }));
        setError(d.error ?? c.certSaveFailed);
        return;
      }
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeCert() {
    if (!confirm(c.removeCertConfirm.replace("{title}", title))) return;
    setSaving(true);
    setError(null);
    try {
      await fetch(`/api/assets/${assetType}/${assetId}/certify`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimension }),
      });
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-line rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-brand-deep text-sm">{title}</h3>
        {current && (
          <button
            onClick={removeCert}
            disabled={saving}
            className="text-[11px] text-red-500 hover:text-red-700 hover:underline"
          >
            {t.common.remove}
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted mb-4">{subtitle}</p>

      {/* Current status */}
      {current ? (
        <div className="mb-3 px-3 py-2 rounded-lg bg-canvas-soft border border-line text-[12px] flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${LEVELS.find((l) => l.code === current)?.badge ?? "bg-gray-300"}`} />
          <span className="font-semibold text-ink">{current}</span> {c.certifiedSuffix}
          {initial?.certDate && <span className="text-muted ml-auto">{initial.certDate}</span>}
        </div>
      ) : (
        <div className="mb-3 px-3 py-2 rounded-lg bg-canvas-soft border border-line text-[12px] text-muted italic">
          {c.notYetCertified}
        </div>
      )}

      {/* Level selector */}
      <div className="flex gap-2 mb-3">
        {LEVELS.map((l) => (
          <button
            key={l.code}
            onClick={() => setCert(l.code)}
            disabled={saving}
            className={`flex-1 py-2 px-3 rounded-lg border-2 text-[12px] font-bold transition-colors ${
              current === l.code
                ? l.color + " ring-2 ring-offset-1 ring-brand-purple/40"
                : "border-line bg-white text-ink hover:border-brand-purple/40"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* Notes */}
      <div>
        <label className="field-label">{c.certNotesLabel} <span className="text-muted font-normal normal-case">{c.certNotesOptional}</span></label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="input-field resize-none text-[12px]"
          placeholder={c.certNotesPlaceholder}
        />
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
      )}
    </div>
  );
}

export function CertifyAssetModal({ assetType, assetId, assetName, onClose, onSaved }: Props) {
  const { t } = useLang();
  const c = t.catalog;
  const [data,    setData]    = useState<Record<string, DimState> | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/assets/${assetType}/${assetId}/certify`);
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [assetType, assetId]);

  function handleRefresh() {
    load();
    onSaved?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-brand-deep">{c.certifyAssetTitle}</h2>
            <p className="text-[11px] text-muted font-mono mt-0.5">{assetName}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-[12px] text-muted">
            {c.certifyAssetDesc}
          </p>

          {loading ? (
            <div className="py-8 text-center text-muted text-sm">{t.common.loading}</div>
          ) : (
            <>
              <DimPanel
                title={c.metadataCertificationTitle}
                subtitle={c.metadataCertificationDesc}
                dimension="METADATA"
                assetType={assetType}
                assetId={assetId}
                initial={data?.METADATA ?? null}
                onRefresh={handleRefresh}
              />
              <DimPanel
                title={c.dataCertificationTitle}
                subtitle={c.dataCertificationDesc}
                dimension="DATA"
                assetType={assetType}
                assetId={assetId}
                initial={data?.DATA ?? null}
                onRefresh={handleRefresh}
              />
            </>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-line">
          <button onClick={onClose} className="btn btn-primary">{c.doneBtn}</button>
        </div>
      </div>
    </div>
  );
}
