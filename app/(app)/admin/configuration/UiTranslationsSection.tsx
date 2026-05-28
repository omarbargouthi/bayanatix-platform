"use client";

import { useState, useEffect, useCallback } from "react";
import { en } from "@/lib/i18n/en";
import { useLang } from "@/lib/lang-context";
import type { TranslationRow } from "@/lib/lang-context";

function flattenKeys(obj: object, prefix = ""): { key: string; defaultVal: string }[] {
  const result: { key: string; defaultVal: string }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      result.push({ key: path, defaultVal: v });
    } else if (typeof v === "object" && v !== null) {
      result.push(...flattenKeys(v, path));
    }
  }
  return result;
}

function groupBySection(keys: { key: string; defaultVal: string }[]) {
  const groups: Record<string, { key: string; defaultVal: string }[]> = {};
  for (const item of keys) {
    const section = item.key.split(".")[0];
    if (!groups[section]) groups[section] = [];
    groups[section].push(item);
  }
  return groups;
}

const SECTION_LABELS: Record<string, string> = {
  nav:        "Navigation",
  roles:      "User Roles",
  common:     "Common / Shared",
  compliance: "Compliance Assessment",
  config:     "Configuration Tab",
  registers:  "Registers",
  governance: "Governance",
};

export function UiTranslationsSection() {
  const { reloadTranslations } = useLang();

  const allKeys = flattenKeys(en);
  const groups  = groupBySection(allKeys);

  const [editState, setEditState] = useState<Record<string, { en: string; ar: string }>>({});
  const [saving,    setSaving]    = useState<Set<string>>(new Set());
  const [saved,     setSaved]     = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string>("nav");

  const loadRows = useCallback(async () => {
    const r = await fetch("/api/admin/translations");
    if (!r.ok) return;
    const rows: TranslationRow[] = await r.json();
    const state: Record<string, { en: string; ar: string }> = {};
    for (const row of rows) {
      if (!state[row.key]) state[row.key] = { en: "", ar: "" };
      state[row.key][row.lang as "en" | "ar"] = row.value;
    }
    setEditState(state);
  }, []);

  useEffect(() => { loadRows(); }, [loadRows]);

  function getEdit(key: string, lang: "en" | "ar"): string {
    return editState[key]?.[lang] ?? "";
  }

  function setEdit(key: string, lang: "en" | "ar", value: string) {
    setEditState(prev => ({
      ...prev,
      [key]: { en: prev[key]?.en ?? "", ar: prev[key]?.ar ?? "", [lang]: value },
    }));
  }

  async function saveRow(key: string) {
    setSaving(prev => new Set(prev).add(key));
    try {
      const enVal = (editState[key]?.en ?? "").trim();
      const arVal = (editState[key]?.ar ?? "").trim();

      if (enVal) {
        await fetch("/api/admin/translations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, lang: "en", value: enVal }),
        });
      } else {
        await fetch("/api/admin/translations", {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, lang: "en" }),
        });
      }

      if (arVal) {
        await fetch("/api/admin/translations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, lang: "ar", value: arVal }),
        });
      } else {
        await fetch("/api/admin/translations", {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, lang: "ar" }),
        });
      }

      setSaved(prev => new Set(prev).add(key));
      setTimeout(() => setSaved(prev => { const s = new Set(prev); s.delete(key); return s; }), 2000);
      reloadTranslations();
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }

  const sectionKeys  = Object.keys(groups);
  const currentKeys  = groups[activeSection] ?? [];

  return (
    <div className="flex gap-6">
      {/* Sub-section nav */}
      <div className="w-44 shrink-0">
        <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 px-1">Section</div>
        {sectionKeys.map(s => (
          <button key={s}
            onClick={() => setActiveSection(s)}
            className={`w-full text-left px-3 py-2 rounded-lg mb-1 text-sm transition-colors
              ${activeSection === s
                ? "bg-brand-purple/10 text-brand-purple font-semibold"
                : "text-ink-soft hover:bg-canvas-soft"}`}>
            {SECTION_LABELS[s] ?? s}
            <span className="ml-1.5 text-[10px] text-muted">({groups[s]?.length ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Translation table */}
      <div className="flex-1 min-w-0">
        <div className="mb-4">
          <h3 className="text-base font-bold text-ink">{SECTION_LABELS[activeSection] ?? activeSection}</h3>
          <p className="text-xs text-muted mt-0.5">
            Override the default English text or add Arabic translations. Leave blank to use the static default.
          </p>
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-[2fr_2fr_2fr_64px] gap-3 px-4 py-2.5 bg-canvas-soft border-b border-line text-[10px] uppercase tracking-wider text-muted font-bold">
            <div>Key · Default</div>
            <div>English Override</div>
            <div>Arabic (AR) ع</div>
            <div></div>
          </div>

          {currentKeys.map(({ key, defaultVal }) => (
            <div key={key}
              className="grid grid-cols-[2fr_2fr_2fr_64px] gap-3 px-4 py-2.5 border-b border-line-soft last:border-b-0 items-center hover:bg-canvas-soft/40">
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-brand-deep font-semibold truncate">{key}</div>
                <div className="text-[11px] text-muted mt-0.5 truncate">{defaultVal}</div>
              </div>
              <input
                className="input w-full text-sm"
                placeholder={defaultVal}
                value={getEdit(key, "en")}
                onChange={e => setEdit(key, "en", e.target.value)}
              />
              <input
                className="input w-full text-sm"
                dir="rtl"
                placeholder="أدخل الترجمة…"
                value={getEdit(key, "ar")}
                onChange={e => setEdit(key, "ar", e.target.value)}
              />
              <div className="flex items-center justify-center">
                {saved.has(key) ? (
                  <span className="text-green-600 text-sm font-bold">✓</span>
                ) : (
                  <button
                    onClick={() => saveRow(key)}
                    disabled={saving.has(key)}
                    className="btn btn-primary btn-sm text-xs">
                    {saving.has(key) ? "…" : "Save"}
                  </button>
                )}
              </div>
            </div>
          ))}

          {currentKeys.length === 0 && (
            <div className="py-10 text-center text-muted text-sm">No keys in this section.</div>
          )}
        </div>
      </div>
    </div>
  );
}
