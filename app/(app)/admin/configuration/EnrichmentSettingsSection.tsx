"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Settings = {
  batchSize: number;
  nullCheckBufferPct: number; nullCheckSoftThresholdPct: number; uniquenessBufferPct: number;
  profileFreshnessDays: number; defaultLanguageCode: string;
};

// Provider/model/credentials/token-budget config moved to /admin/ai-providers
// (LLM Provider Configuration feature) — a single profile can now serve multiple
// capabilities and multiple profiles can exist at once, which no longer fits a
// single global settings row. What's left here is genuinely global: DQ-suggestion
// thresholds, the profile-freshness window, batch size, and default language.
export function EnrichmentSettingsSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const r = await fetch("/api/enrichment/settings");
    setSettings(await r.json());
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await fetch("/api/enrichment/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="text-sm text-muted">Loading…</div>;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => (s ? { ...s, [key]: value } : s));

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink">AI Enrichment Settings</h2>
          <p className="text-xs text-muted mt-1">
            Thresholds and rate controls for the AI-suggested descriptions and DQ rules features.
            Tier 1 (deterministic) DQ rules never depend on this — only AI-generated text and Tier 2 semantic rules do.
          </p>
        </div>
        <Link href="/admin/ai-providers" className="btn btn-sm shrink-0">Manage AI Providers →</Link>
      </div>

      <div className="bg-white border border-line rounded-xl p-6 max-w-2xl space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Batch Size</label>
            <input type="number" value={settings.batchSize} onChange={(e) => set("batchSize", Number(e.target.value))}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Default Language</label>
            <select value={settings.defaultLanguageCode} onChange={(e) => set("defaultLanguageCode", e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white">
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <div className="text-xs font-semibold text-ink mb-3">DQ Suggestion Thresholds</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] text-muted mb-1">Null Check Buffer %</label>
              <input type="number" step="0.1" value={settings.nullCheckBufferPct} onChange={(e) => set("nullCheckBufferPct", Number(e.target.value))}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-muted mb-1">Soft Null Threshold %</label>
              <input type="number" step="0.1" value={settings.nullCheckSoftThresholdPct} onChange={(e) => set("nullCheckSoftThresholdPct", Number(e.target.value))}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-muted mb-1">Uniqueness Buffer %</label>
              <input type="number" step="0.1" value={settings.uniquenessBufferPct} onChange={(e) => set("uniquenessBufferPct", Number(e.target.value))}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <label className="block text-xs font-semibold text-ink mb-1">Profile Freshness Window (days)</label>
          <input type="number" value={settings.profileFreshnessDays} onChange={(e) => set("profileFreshnessDays", Number(e.target.value))}
            className="w-full max-w-xs border border-line rounded-lg px-3 py-2 text-sm" />
          <p className="text-[10px] text-muted mt-1">DQ suggestions degrade to structure-only past this age.</p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Save Settings"}</button>
          {saved && <span className="text-xs text-green-700 font-semibold">✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}
