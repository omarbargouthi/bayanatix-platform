"use client";

import { useState, useEffect } from "react";

type ScheduledJobArea = {
  areaCode:     string;
  scheduleCron: string;
  isEnabled:    boolean;
  lastRunAt:    string | null;
};

// Deliberately only the two AREA-level jobs (Reports, Regulation) -- crawl and
// DQ rule scheduling are per-row (one connection, one rule) and stay managed
// from their own pages (Admin > Sources / the DQ rule editor), unchanged.
const AREA_META: Record<string, { label: string; description: string }> = {
  REPORTS_SNAPSHOT: {
    label: "Reports",
    description: "Monthly KPI snapshot capture for Reports and Domain Scorecards.",
  },
  REGULATION_TREND: {
    label: "Regulation",
    description: "Maturity/compliance trend capture for the Dashboard and each regulation's Compliance Assessment page.",
  },
};

export function SchedulingConfigSection() {
  const [areas, setAreas]     = useState<ScheduledJobArea[]>([]);
  const [drafts, setDrafts]   = useState<Record<string, { scheduleCron: string; isEnabled: boolean }>>({});
  const [saving, setSaving]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/scheduled-jobs");
    const data: ScheduledJobArea[] = await r.json();
    setAreas(data);
    setDrafts(Object.fromEntries(data.map((a) => [a.areaCode, { scheduleCron: a.scheduleCron, isEnabled: a.isEnabled }])));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(areaCode: string) {
    const draft = drafts[areaCode];
    setSaving(areaCode);
    setError(null);
    try {
      const r = await fetch("/api/admin/scheduled-jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaCode, scheduleCron: draft.scheduleCron, isEnabled: draft.isEnabled }),
      });
      if (!r.ok) { const e = await r.json(); setError(e.error); return; }
      await load();
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">Scheduling</h2>
        <p className="text-xs text-muted mt-1">
          How often each background capture job runs. Checked by <code className="font-mono">scripts/scheduler.mjs</code>'s
          poll tick — a cron expression here is the real schedule, not just how often it's checked. Crawl and Data Quality
          rule schedules are managed per-item, not here.
        </p>
      </div>

      {error && <div className="mb-4 text-sm px-3 py-2 rounded-md bg-red-50 text-red-600">{error}</div>}

      <div className="space-y-4">
        {areas.map((a) => {
          const meta = AREA_META[a.areaCode] ?? { label: a.areaCode, description: "" };
          const draft = drafts[a.areaCode] ?? { scheduleCron: a.scheduleCron, isEnabled: a.isEnabled };
          const dirty = draft.scheduleCron !== a.scheduleCron || draft.isEnabled !== a.isEnabled;
          return (
            <div key={a.areaCode} className="bg-white border border-line rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">{meta.label}</h3>
                  <p className="text-xs text-muted mt-0.5">{meta.description}</p>
                </div>
                <label className="flex items-center gap-2 shrink-0 pt-0.5">
                  <input
                    type="checkbox"
                    checked={draft.isEnabled}
                    onChange={(e) => setDrafts((d) => ({ ...d, [a.areaCode]: { ...draft, isEnabled: e.target.checked } }))}
                    className="w-4 h-4 accent-brand-purple"
                  />
                  <span className="text-xs text-ink-soft">Enabled</span>
                </label>
              </div>

              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Cron Expression</label>
                  <input
                    className="input w-full font-mono text-sm"
                    value={draft.scheduleCron}
                    onChange={(e) => setDrafts((d) => ({ ...d, [a.areaCode]: { ...draft, scheduleCron: e.target.value } }))}
                  />
                </div>
                <div className="text-xs text-muted pb-2">
                  Last run: {a.lastRunAt ? new Date(a.lastRunAt).toLocaleString() : "never"}
                </div>
                <button
                  onClick={() => handleSave(a.areaCode)}
                  disabled={!dirty || saving === a.areaCode}
                  className="btn btn-primary btn-sm disabled:opacity-50"
                >
                  {saving === a.areaCode ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
