"use client";

import { useState, useEffect } from "react";

type Settings = {
  activeRegionCode: string;
  sampleSize: number;
  minConfidenceThreshold: number;
  autoAcceptBand: "NONE" | "HIGH";
};

type Region = { regionCode: string; regionNameText: string };
type TermSummary = { glossaryId: number; termName: string; classificationCode: string | null; domainName: string | null; patternCount: number };
type PatternType = "NAME_REGEX" | "VALUE_REGEX" | "CHECKSUM";
type Pattern = {
  patternId: number; glossaryId: number; regionCode: string; patternType: PatternType;
  patternText: string; confidenceWeight: number; isEnabled: boolean; notesText: string | null;
};

const PATTERN_TYPES: PatternType[] = ["NAME_REGEX", "VALUE_REGEX", "CHECKSUM"];
const CHECKSUM_ALGORITHMS = ["LUHN", "IBAN_MOD97", "SA_NATIONAL_ID"];
const NEW_PATTERN = { regionCode: "GLOBAL", patternType: "VALUE_REGEX" as PatternType, patternText: "", confidenceWeight: 0.5 };

// Editable pattern list for one SIT term — fetches lazily on expand, PATCHes
// individual fields inline, POSTs the add-row form. All mutating calls are
// ADMIN-gated server-side (app/api/sit/patterns) regardless of what this
// component lets you click.
function TermPatternEditor({ term, regions }: { term: TermSummary; regions: Region[] }) {
  const [patterns, setPatterns] = useState<Pattern[] | null>(null);
  const [newPattern, setNewPattern] = useState({ ...NEW_PATTERN });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch(`/api/sit/patterns?glossary_id=${term.glossaryId}`);
    setPatterns(await r.json());
  }
  useEffect(() => { void load(); }, [term.glossaryId]);

  async function patch(patternId: number, body: Record<string, unknown>) {
    setError(null);
    const r = await fetch(`/api/sit/patterns/${patternId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? "Failed to save"); return; }
    await load();
  }

  async function remove(patternId: number) {
    setBusy(true);
    try {
      await fetch(`/api/sit/patterns/${patternId}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addPattern() {
    setError(null);
    if (!newPattern.patternText.trim()) { setError("Pattern text is required"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/sit/patterns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          glossary_id: term.glossaryId, region_code: newPattern.regionCode, pattern_type: newPattern.patternType,
          pattern_text: newPattern.patternText.trim(), confidence_weight: newPattern.confidenceWeight,
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? "Failed to add pattern"); return; }
      setNewPattern({ ...NEW_PATTERN });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!patterns) return <div className="px-4 py-3 text-xs text-muted">Loading patterns…</div>;

  return (
    <div className="px-4 py-3 bg-canvas-soft border-t border-line-soft space-y-2">
      {patterns.length === 0 && <div className="text-[11px] text-muted">No patterns yet — this term will never be suggested automatically until one is added below.</div>}
      {patterns.map((p) => (
        <div key={p.patternId} className="flex items-center gap-2 flex-wrap bg-white border border-line rounded-lg px-2.5 py-2">
          <select value={p.regionCode} onChange={(e) => patch(p.patternId, { region_code: e.target.value })} className="text-[11px] border border-line rounded px-1.5 py-1">
            {regions.map((r) => <option key={r.regionCode} value={r.regionCode}>{r.regionCode}</option>)}
          </select>
          <select value={p.patternType} onChange={(e) => patch(p.patternId, { pattern_type: e.target.value })} className="text-[11px] border border-line rounded px-1.5 py-1">
            {PATTERN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {p.patternType === "CHECKSUM" ? (
            <select defaultValue={p.patternText} onBlur={(e) => e.target.value !== p.patternText && patch(p.patternId, { pattern_text: e.target.value })} className="text-[11px] border border-line rounded px-1.5 py-1 font-mono">
              {CHECKSUM_ALGORITHMS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          ) : (
            <input
              type="text" defaultValue={p.patternText}
              onBlur={(e) => e.target.value !== p.patternText && patch(p.patternId, { pattern_text: e.target.value })}
              className="text-[11px] font-mono border border-line rounded px-1.5 py-1 flex-1 min-w-[160px]"
            />
          )}
          <input
            type="number" step="0.05" min="0.05" max="1" defaultValue={p.confidenceWeight}
            onBlur={(e) => Number(e.target.value) !== p.confidenceWeight && patch(p.patternId, { confidence_weight: Number(e.target.value) })}
            className="text-[11px] border border-line rounded px-1.5 py-1 w-16"
            title="Confidence weight"
          />
          <label className="flex items-center gap-1 text-[11px] text-muted">
            <input type="checkbox" checked={p.isEnabled} onChange={(e) => patch(p.patternId, { is_enabled: e.target.checked })} className="w-3.5 h-3.5 accent-brand-purple" />
            Enabled
          </label>
          <button onClick={() => remove(p.patternId)} disabled={busy} className="text-[11px] text-red-600 hover:underline ml-auto disabled:opacity-40">Delete</button>
        </div>
      ))}

      <div className="flex items-center gap-2 flex-wrap bg-white border border-dashed border-line rounded-lg px-2.5 py-2">
        <select value={newPattern.regionCode} onChange={(e) => setNewPattern((p) => ({ ...p, regionCode: e.target.value }))} className="text-[11px] border border-line rounded px-1.5 py-1">
          {regions.map((r) => <option key={r.regionCode} value={r.regionCode}>{r.regionCode}</option>)}
        </select>
        <select value={newPattern.patternType} onChange={(e) => setNewPattern((p) => ({ ...p, patternType: e.target.value as PatternType, patternText: "" }))} className="text-[11px] border border-line rounded px-1.5 py-1">
          {PATTERN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {newPattern.patternType === "CHECKSUM" ? (
          <select value={newPattern.patternText} onChange={(e) => setNewPattern((p) => ({ ...p, patternText: e.target.value }))} className="text-[11px] border border-line rounded px-1.5 py-1 font-mono">
            <option value="">— algorithm —</option>
            {CHECKSUM_ALGORITHMS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : (
          <input
            type="text" value={newPattern.patternText} onChange={(e) => setNewPattern((p) => ({ ...p, patternText: e.target.value }))}
            placeholder={newPattern.patternType === "NAME_REGEX" ? "e.g. national.?id" : "e.g. ^1\\d{9}$"}
            className="text-[11px] font-mono border border-line rounded px-1.5 py-1 flex-1 min-w-[160px]"
          />
        )}
        <input
          type="number" step="0.05" min="0.05" max="1" value={newPattern.confidenceWeight}
          onChange={(e) => setNewPattern((p) => ({ ...p, confidenceWeight: Number(e.target.value) }))}
          className="text-[11px] border border-line rounded px-1.5 py-1 w-16"
        />
        <button onClick={addPattern} disabled={busy} className="text-[11px] font-semibold text-white bg-brand-purple rounded px-2 py-1 disabled:opacity-40 ml-auto">
          + Add Pattern
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600">{error}</div>}
    </div>
  );
}

// Structural twin of EnrichmentSettingsSection.tsx (singleton settings row, GET-any/
// PATCH-ADMIN route, load/save/flash pattern). The active region picked here is what
// lib/sit-classification-runner.ts loads patterns for — switching it changes which
// SIT terms/patterns apply without any code change, per the region-scoped design
// (patterns are region-scoped rows, not a property of the term).
export function SitSettingsSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [terms, setTerms] = useState<TermSummary[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const [s, r, t] = await Promise.all([
      fetch("/api/sit/settings").then((res) => res.json()),
      fetch("/api/sit/regions").then((res) => res.json()),
      fetch("/api/sit/all-terms").then((res) => res.json()),
    ]);
    setSettings(s);
    setRegions(r);
    setTerms(t);
  }
  useEffect(() => { void load(); }, []);

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

      <div className="mt-6 max-w-3xl">
        <div className="text-xs font-semibold text-ink mb-2">SIT Terms &amp; Patterns ({terms.length})</div>
        <p className="text-[11px] text-muted mb-2">
          A term becomes SIT-eligible via its own "Sensitive Information Type" checkbox in the Business Glossary
          term editor. Every SIT-flagged term shows up here — expand one to add, edit, enable/disable, or delete
          its detection patterns. Only patterns whose region matches the Active Region above (or GLOBAL) are used
          by a live classification run.
        </p>
        <div className="bg-white border border-line rounded-xl divide-y divide-line-soft">
          {terms.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted">
              No terms are flagged as SIT yet — check "Sensitive Information Type" on a term in the Business Glossary to add one here.
            </div>
          ) : terms.map((t) => (
            <div key={t.glossaryId}>
              <button
                onClick={() => setExpandedId(expandedId === t.glossaryId ? null : t.glossaryId)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-canvas-soft"
              >
                <span className="text-sm text-ink">
                  {t.termName}
                  {t.domainName && <span className="text-[11px] text-muted font-normal"> · {t.domainName}</span>}
                </span>
                <div className="flex items-center gap-3">
                  {t.classificationCode && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas-soft text-muted">{t.classificationCode}</span>}
                  <span className="text-[11px] text-muted">{t.patternCount} pattern{t.patternCount !== 1 ? "s" : ""}</span>
                  <span className="text-muted text-[11px]">{expandedId === t.glossaryId ? "▲" : "▼"}</span>
                </div>
              </button>
              {expandedId === t.glossaryId && <TermPatternEditor term={t} regions={regions} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
