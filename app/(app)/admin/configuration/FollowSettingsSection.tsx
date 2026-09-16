"use client";

import { useState, useEffect } from "react";

type Settings = { schemaFollowEnabled: boolean; sourceFollowEnabled: boolean };

export function FollowSettingsSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const r = await fetch("/api/admin/follow-settings");
    setSettings(await r.json());
  }
  useEffect(() => { void load(); }, []);

  async function toggle(key: keyof Settings) {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setSaving(true);
    try {
      await fetch("/api/admin/follow-settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">Follow Settings</h2>
        <p className="text-xs text-muted mt-1">
          Following a table always shows its activity (and its columns') on a user&apos;s Homepage. Following a
          whole schema or data source rolls up activity from everything underneath it, which can mean a lot of
          notifications — each level is off by default until enabled here.
        </p>
      </div>

      <div className="bg-white border border-line rounded-xl p-6 max-w-lg space-y-4">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="text-sm font-semibold text-ink">Allow following Schemas</div>
            <div className="text-[11px] text-muted mt-0.5">Rolls up activity from every table and column in the schema</div>
          </div>
          <input
            type="checkbox"
            checked={settings.schemaFollowEnabled}
            onChange={() => toggle("schemaFollowEnabled")}
            disabled={saving}
            className="w-5 h-5 accent-brand-purple shrink-0"
          />
        </label>
        <div className="border-t border-line-soft" />
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="text-sm font-semibold text-ink">Allow following Data Sources</div>
            <div className="text-[11px] text-muted mt-0.5">Rolls up activity from every schema, table, and column in the source</div>
          </div>
          <input
            type="checkbox"
            checked={settings.sourceFollowEnabled}
            onChange={() => toggle("sourceFollowEnabled")}
            disabled={saving}
            className="w-5 h-5 accent-brand-purple shrink-0"
          />
        </label>
        {saved && <p className="text-[12px] text-emerald-600 font-medium">Saved</p>}
      </div>
    </div>
  );
}
