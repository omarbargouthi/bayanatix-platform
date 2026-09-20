"use client";

import { useState, useEffect } from "react";

type Settings = {
  activeRegionCode: string;
  sampleSize: number;
  minConfidenceThreshold: number;
  autoAcceptBand: "NONE" | "HIGH";
};

type Region = { regionCode: string; regionNameText: string };
type TermOption = { glossaryId: number; termName: string; classificationCode: string | null; patternCount: number };

// Structural twin of EnrichmentSettingsSection.tsx (singleton settings row, GET-any/
// PATCH-ADMIN route, load/save/flash pattern). The active region picked here is what
// lib/sit-classification-runner.ts loads patterns for — switching it changes which
// SIT terms/patterns apply without any code change, per the region-scoped design
// (patterns are region-scoped rows, not a property of the term).
export function SitSettingsSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const [s, r] = await Promise.all([
      fetch("/api/sit/settings").then((res) => res.json()),
      fetch("/api/sit/regions").then((res) => res.json()),
    ]);
    setSettings(s);
    setRegions(r);
  }
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!settings) return;
    fetch(`/api/sit/terms?region=${settings.activeRegionCode}`).then((r) => r.json()).then(setTerms).catch(() => {});
  }, [settings?.activeRegionCode]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await fetch("/api/sit/settings", {
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
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">Sensitive Information Types</h2>
        <p className="text-xs text-muted mt-1">
          Region-scoped format/regex patterns used to suggest which SIT business-glossary term a column
          represents, once it's confirmed as a Business asset. Switching the active region changes which
          pattern set applies without needing new content — Canada (or any other region) is added as new
          pattern rows against the same terms.
        </p>
      </div>

      <div className="bg-white border border-line rounded-xl p-6 max-w-2xl space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Active Region</label>
            <select value={settings.activeRegionCode} onChange={(e) => set("activeRegionCode", e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white">
              {regions.filter((r) => r.regionCode !== "GLOBAL").map((r) => (
                <option key={r.regionCode} value={r.regionCode}>{r.regionNameText}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Auto-accept Band</label>
            <select value={settings.autoAcceptBand} onChange={(e) => set("autoAcceptBand", e.target.value as "NONE" | "HIGH")}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white">
              <option value="NONE">Never auto-accept — always review</option>
              <option value="HIGH">Auto-accept HIGH confidence</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div>
            <label className="block text-[11px] text-muted mb-1">Live Sample Size</label>
            <input type="number" value={settings.sampleSize} onChange={(e) => set("sampleSize", Number(e.target.value))}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-muted mb-1">Minimum Confidence Threshold</label>
            <input type="number" step="0.05" min="0" max="1" value={settings.minConfidenceThreshold}
              onChange={(e) => set("minConfidenceThreshold", Number(e.target.value))}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Save Settings"}</button>
          {saved && <span className="text-xs text-green-700 font-semibold">✓ Saved</span>}
        </div>
      </div>

      <div className="mt-6 max-w-2xl">
        <div className="text-xs font-semibold text-ink mb-2">
          SIT Terms active for {regions.find((r) => r.regionCode === settings.activeRegionCode)?.regionNameText ?? settings.activeRegionCode} ({terms.length})
        </div>
        <div className="bg-white border border-line rounded-xl divide-y divide-line-soft">
          {terms.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted">No SIT terms have a pattern enabled for this region yet.</div>
          ) : terms.map((t) => (
            <div key={t.glossaryId} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-ink">{t.termName}</span>
              <div className="flex items-center gap-3">
                {t.classificationCode && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas-soft text-muted">{t.classificationCode}</span>}
                <span className="text-[11px] text-muted">{t.patternCount} pattern{t.patternCount !== 1 ? "s" : ""}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted mt-2">Pattern editing is read-only here for now — new patterns are added via migration.</p>
      </div>
    </div>
  );
}
