"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/lib/lang-context";
import { LANGUAGE_REGISTRY } from "@/lib/lang-config";

export function LanguageSettingsSection() {
  const { secondaryLangDef, reloadSystemConfig } = useLang();
  const [selected, setSelected] = useState(secondaryLangDef.code);

  // Sync if context updates (e.g. after save)
  useEffect(() => { setSelected(secondaryLangDef.code); }, [secondaryLangDef.code]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = selected !== secondaryLangDef.code;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/admin/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secondary_language: selected }),
      });
      reloadSystemConfig();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  const selectedDef = LANGUAGE_REGISTRY.find(l => l.code === selected)!;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">Language Settings</h2>
        <p className="text-xs text-muted mt-1">
          The platform uses English as the base language. Configure a second language for bilingual
          UI labels, lookup values, and auto-translation of compliance content.
        </p>
      </div>

      <div className="card p-6 space-y-6">
        {/* Base language — read-only */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Base Language
          </label>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-canvas-soft border border-line">
            <span className="text-sm font-semibold text-ink">English</span>
            <span className="text-[10px] font-mono text-muted bg-white px-2 py-0.5 rounded border border-line">en</span>
            <span className="text-[10px] text-muted">LTR · Always active · Cannot be changed</span>
          </div>
        </div>

        {/* Second language — configurable */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Second Language
          </label>
          <div className="space-y-3">
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className="input w-full"
            >
              {LANGUAGE_REGISTRY.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.displayName} — {lang.nativeName} ({lang.code})
                </option>
              ))}
            </select>

            {selectedDef && (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="px-3 py-2.5 rounded-lg bg-canvas-soft border border-line">
                  <div className="text-[10px] text-muted uppercase font-semibold mb-0.5">Code</div>
                  <div className="font-mono text-sm font-bold text-brand-deep">{selectedDef.code}</div>
                </div>
                <div className="px-3 py-2.5 rounded-lg bg-canvas-soft border border-line">
                  <div className="text-[10px] text-muted uppercase font-semibold mb-0.5">Direction</div>
                  <div className="text-sm font-semibold text-ink">
                    {selectedDef.direction === "rtl" ? "Right-to-Left (RTL)" : "Left-to-Right (LTR)"}
                  </div>
                </div>
                <div className="px-3 py-2.5 rounded-lg bg-canvas-soft border border-line">
                  <div className="text-[10px] text-muted uppercase font-semibold mb-0.5">Locale</div>
                  <div className="font-mono text-sm text-ink">{selectedDef.locale}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Auto-translate note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 space-y-1">
          <div className="font-semibold">Auto-translation</div>
          <div>
            The translate feature (compliance levels, domain names, requirements) uses the configured
            second language. Translations are cached in the database and can be overridden manually.
          </div>
          <div>
            UI string overrides (Admin → Configuration → UI Translations) also apply to the second language.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="btn btn-primary"
          >
            {saving ? "Saving…" : "Save Language Settings"}
          </button>
          {saved && (
            <span className="text-sm text-emerald-600 font-semibold">Saved ✓</span>
          )}
          {!dirty && !saved && (
            <span className="text-sm text-muted">No changes</span>
          )}
        </div>
      </div>
    </div>
  );
}
