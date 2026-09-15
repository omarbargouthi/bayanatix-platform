"use client";

import { useState, useEffect } from "react";

type Settings = { sampleRecordCount: number };

export function SampleDataConfigSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const r = await fetch("/api/admin/sample-data-settings");
    setSettings(await r.json());
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await fetch("/api/admin/sample-data-settings", {
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

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">Sample Data</h2>
        <p className="text-xs text-muted mt-1">
          Controls how many rows the Sample Data tab previews on a table's page. Applies platform-wide.
        </p>
      </div>

      <div className="bg-white border border-line rounded-xl p-6 max-w-md space-y-4">
        <div>
          <label className="block text-xs font-semibold text-ink mb-1">Sample Record Count</label>
          <input
            type="number"
            min={1}
            value={settings.sampleRecordCount}
            onChange={(e) => setSettings({ sampleRecordCount: Number(e.target.value) })}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-muted mt-1">Number of rows shown per table when a live source connection is available.</p>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-[12px] text-emerald-600 font-medium">Saved</span>}
        </div>
      </div>
    </div>
  );
}
