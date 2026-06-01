"use client";

import { useEffect, useState, useCallback } from "react";
import { useLang } from "@/lib/lang-context";
import type { LegalHold, DataCategory } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:   "bg-red-100 text-red-700",
  RELEASED: "bg-green-100 text-green-700",
  EXPIRED:  "bg-gray-100 text-gray-500",
};

function HoldStatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-500";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${cls}`}>
      {status}
    </span>
  );
}

// ── New Hold Modal ─────────────────────────────────────────────────────────────

function NewHoldModal({
  categories,
  onClose,
  onCreated,
}: {
  categories: DataCategory[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useLang();
  const r = t.retention;
  const [form, setForm] = useState({
    caseReference: "",
    caseName: "",
    holdScopeType: "CATEGORY",
    holdDate: new Date().toISOString().slice(0, 10),
    notes: "",
    categoryIds: [] as number[],
  });
  const [saving, setSaving] = useState(false);

  function toggleCategory(id: number) {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter((c) => c !== id)
        : [...f.categoryIds, id],
    }));
  }

  async function submit() {
    if (!form.caseReference || !form.caseName) return;
    setSaving(true);
    await fetch("/api/retention/legal-holds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    onCreated();
    onClose();
  }

  const allCats = categories.flatMap((c) => [c, ...(c.children ?? [])]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <h2 className="font-bold text-ink mb-4">{r.newHold}</h2>
        <div className="space-y-3 text-[12px]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted mb-1">{r.caseReference} *</label>
              <input className="input-sm w-full" value={form.caseReference} onChange={(e) => setForm((f) => ({ ...f, caseReference: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] text-muted mb-1">{r.caseName} *</label>
              <input className="input-sm w-full" value={form.caseName} onChange={(e) => setForm((f) => ({ ...f, caseName: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted mb-1">{r.scopeType}</label>
              <select className="input-sm w-full" value={form.holdScopeType} onChange={(e) => setForm((f) => ({ ...f, holdScopeType: e.target.value }))}>
                <option value="CATEGORY">{r.scopeCategory}</option>
                <option value="ENTITY">{r.scopeEntity}</option>
                <option value="GLOBAL">{r.scopeGlobal}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-muted mb-1">{r.holdDate}</label>
              <input type="date" className="input-sm w-full" value={form.holdDate} onChange={(e) => setForm((f) => ({ ...f, holdDate: e.target.value }))} />
            </div>
          </div>

          {form.holdScopeType === "CATEGORY" && (
            <div>
              <label className="block text-[11px] text-muted mb-1">{r.affectedCategories}</label>
              <div className="max-h-40 overflow-y-auto border border-line rounded-lg p-2 space-y-1">
                {allCats.map((c) => (
                  <label key={c.categoryId} className="flex items-center gap-2 cursor-pointer py-0.5 hover:bg-gray-50 rounded px-1">
                    <input
                      type="checkbox"
                      checked={form.categoryIds.includes(c.categoryId)}
                      onChange={() => toggleCategory(c.categoryId)}
                    />
                    <span className={`text-[11px] ${c.parentId ? "ml-3 text-muted" : "font-medium"}`}>{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-muted mb-1">{t.common.description}</label>
            <textarea className="input-sm w-full" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={onClose}>{t.common.cancel}</button>
          <button className="btn-primary" disabled={saving || !form.caseReference || !form.caseName} onClick={submit}>
            {saving ? t.common.saving : t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Release Hold Modal ─────────────────────────────────────────────────────────

function ReleaseModal({
  hold,
  onClose,
  onReleased,
}: {
  hold: LegalHold;
  onClose: () => void;
  onReleased: () => void;
}) {
  const { t } = useLang();
  const r = t.retention;
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    await fetch(`/api/retention/legal-holds/${hold.holdId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdStatus: "RELEASED",
        releaseDate: new Date().toISOString().slice(0, 10),
        releaseJustification: justification,
      }),
    });
    setSaving(false);
    onReleased();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="font-bold text-ink mb-3">{r.releaseHold}</h2>
        <p className="text-[12px] text-muted mb-3">
          {hold.caseReference} — {hold.caseName}
        </p>
        <label className="block text-[11px] text-muted mb-1">{r.releaseJustification}</label>
        <textarea
          className="input-sm w-full mb-4"
          rows={3}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>{t.common.cancel}</button>
          <button className="btn-primary" disabled={saving} onClick={submit}>
            {saving ? t.common.saving : r.releaseHold}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function LegalHoldsTab() {
  const { t } = useLang();
  const r = t.retention;
  const [holds, setHolds] = useState<LegalHold[] | null>(null);
  const [categories, setCategories] = useState<DataCategory[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [releasing, setReleasing] = useState<LegalHold | null>(null);

  const load = useCallback(() => {
    fetch("/api/retention/legal-holds").then((res) => res.json()).then(setHolds).catch(() => setHolds([]));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/retention/categories").then((res) => res.json()).then(setCategories).catch(() => {});
  }, []);

  const statusLabel: Record<string, string> = {
    ACTIVE: r.statusActive, RELEASED: r.statusReleased, EXPIRED: r.statusExpired,
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">{r.legalHoldsTitle}</h2>
          <button className="btn-primary text-[12px]" onClick={() => setShowNew(true)}>
            + {r.newHold}
          </button>
        </div>

        {holds == null ? (
          <div className="py-8 text-center text-muted">{t.common.loading}</div>
        ) : holds.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-3xl mb-2">⚖️</div>
            <p className="text-muted text-[13px]">{r.noLegalHolds}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {holds.map((hold) => (
              <div key={hold.holdId} className={`rounded-xl border p-4 ${hold.holdStatus === "ACTIVE" ? "border-red-200 bg-red-50/30" : "border-line bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[13px] text-ink">{hold.caseName}</span>
                      <span className="text-[11px] font-mono text-muted">{hold.caseReference}</span>
                      <HoldStatusBadge status={hold.holdStatus} />
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted flex-wrap">
                      <span>{r.holdDate}: {hold.holdDate}</span>
                      {hold.releaseDate && <span>{r.releaseDate}: {hold.releaseDate}</span>}
                      <span>{r.placedBy}: {hold.placedByName ?? hold.placedBy}</span>
                      <span className="capitalize">{hold.holdScopeType.toLowerCase()}</span>
                    </div>
                    {hold.categoryNames && hold.categoryNames.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {hold.categoryNames.map((name, i) => (
                          <span key={i} className="text-[9px] px-2 py-0.5 bg-brand-purple/10 text-brand-purple rounded-full">
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    {hold.notes && <p className="text-[11px] text-muted mt-1.5 italic">{hold.notes}</p>}
                  </div>
                  {hold.holdStatus === "ACTIVE" && (
                    <button
                      className="shrink-0 text-[11px] px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      onClick={() => setReleasing(hold)}
                    >
                      {r.releaseHold}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewHoldModal
          categories={categories}
          onClose={() => setShowNew(false)}
          onCreated={load}
        />
      )}
      {releasing && (
        <ReleaseModal
          hold={releasing}
          onClose={() => setReleasing(null)}
          onReleased={load}
        />
      )}
    </div>
  );
}
