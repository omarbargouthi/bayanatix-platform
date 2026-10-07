"use client";

import { useState, useEffect } from "react";
import { DEFAULT_TERM_ASSIGNMENT_WEIGHTS } from "@/lib/sit-classifier";

type WeightKey = keyof typeof DEFAULT_TERM_ASSIGNMENT_WEIGHTS;
const WEIGHT_KEYS = Object.keys(DEFAULT_TERM_ASSIGNMENT_WEIGHTS) as WeightKey[];

// "Default 0.85" under a weight field; flagged when the current value differs from it.
function DefaultHint({ value, k }: { value: number; k: WeightKey }) {
  const def = DEFAULT_TERM_ASSIGNMENT_WEIGHTS[k];
  const changed = Number(value) !== def;
  return (
    <div className={`text-[10px] mt-0.5 ${changed ? "text-amber-700 font-semibold" : "text-muted"}`}>
      Default {def}{changed ? " · changed" : ""}
    </div>
  );
}

type Settings = {
  activeRegionCode: string;
  sampleSize: number;
  minConfidenceThreshold: number;
  autoAcceptBand: "NONE" | "HIGH";
  nameOnlyMatchWeight: number;
  nameWeightFactor: number;
  valueWeightFactor: number;
  checksumWeightFactor: number;
  highBandThreshold: number;
  mediumBandThreshold: number;
};

type Region = { regionCode: string; regionNameText: string };
type SitType = {
  sitTypeId: number; sitName: string; classificationCode: string | null; description: string | null;
  patternCount: number; isEnabled: boolean; regions: string[];
};
type PatternType = "NAME_REGEX" | "VALUE_REGEX" | "CHECKSUM";
type Pattern = {
  patternId: number; sitTypeId: number; regionCode: string; patternType: PatternType;
  patternText: string; confidenceWeight: number; isEnabled: boolean; notesText: string | null;
};

const PATTERN_TYPES: PatternType[] = ["NAME_REGEX", "VALUE_REGEX", "CHECKSUM"];
const CHECKSUM_ALGORITHMS = ["LUHN", "IBAN_MOD97", "SA_NATIONAL_ID"];
const CLASSIFICATION_OPTIONS = ["", "PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "SECRET", "TOP_SECRET"];
const NEW_PATTERN = { regionCode: "GLOBAL", patternType: "VALUE_REGEX" as PatternType, patternText: "", confidenceWeight: 0.5 };

// Editable pattern list for one SIT type — fetches lazily on expand, PATCHes
// individual fields inline, POSTs the add-row form. All mutating calls are
// ADMIN-gated server-side (app/api/sit/patterns) regardless of what this
// component lets you click.
function SitTypePatternEditor({ sitType, regions }: { sitType: SitType; regions: Region[] }) {
  const [patterns, setPatterns] = useState<Pattern[] | null>(null);
  const [newPattern, setNewPattern] = useState({ ...NEW_PATTERN });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch(`/api/sit/patterns?sit_type_id=${sitType.sitTypeId}`);
    setPatterns(await r.json());
  }
  useEffect(() => { void load(); }, [sitType.sitTypeId]);

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
          sit_type_id: sitType.sitTypeId, region_code: newPattern.regionCode, pattern_type: newPattern.patternType,
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
      {patterns.length === 0 && <div className="text-[11px] text-muted">No patterns yet — this SIT value will never be suggested automatically until one is added below.</div>}
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

const BLANK_TYPE = { sitName: "", classificationCode: "", description: "" };

// Structural twin of EnrichmentSettingsSection.tsx (singleton settings row, GET-any/
// PATCH-ADMIN route, load/save/flash pattern). The active region picked here is what
// lib/sit-classification-runner.ts loads patterns for — switching it changes which
// SIT types/patterns apply without any code change, per the region-scoped design
// (patterns are region-scoped rows, not a property of the type).
export function SitSettingsSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [types, setTypes] = useState<SitType[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState({ ...BLANK_TYPE });
  const [addError, setAddError] = useState<string | null>(null);

  async function load() {
    const [s, r, t] = await Promise.all([
      fetch("/api/sit/settings").then((res) => res.json()),
      fetch("/api/sit/regions").then((res) => res.json()),
      fetch("/api/sit/types").then((res) => res.json()),
    ]);
    setSettings(s);
    setRegions(r);
    setTypes(t);
  }
  useEffect(() => { void load(); }, []);

  const [saveError, setSaveError] = useState<string | null>(null);
  // Puts the shipped values back in the form; nothing is stored until Save Settings.
  function resetWeights() {
    setSettings((cur) => (cur ? { ...cur, ...DEFAULT_TERM_ASSIGNMENT_WEIGHTS } : cur));
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      setSaveError(null);
      const r = await fetch("/api/sit/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setSaveError(d.error ?? "The settings could not be saved.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function createType() {
    setAddError(null);
    if (!newType.sitName.trim()) { setAddError("Name is required"); return; }
    const r = await fetch("/api/sit/types", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sit_name: newType.sitName.trim(), classification_code: newType.classificationCode || null, description: newType.description || null }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setAddError(d.error ?? "Failed to create"); return; }
    setNewType({ ...BLANK_TYPE });
    setAdding(false);
    await load();
  }

  async function removeType(sitTypeId: number) {
    if (!confirm("Delete this SIT type? Every business term associated with it will lose that association, and its patterns are deleted.")) return;
    await fetch(`/api/sit/types/${sitTypeId}`, { method: "DELETE" });
    await load();
  }

  async function patchType(sitTypeId: number, body: Record<string, unknown>) {
    await fetch(`/api/sit/types/${sitTypeId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    await load();
  }

  async function setRegionEnabled(regionCode: string, isEnabled: boolean) {
    await fetch("/api/sit/types/by-region", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region_code: regionCode, is_enabled: isEnabled }),
    });
    await load();
  }

  if (!settings) return <div className="text-sm text-muted">Loading…</div>;

  // Segregate the catalog by country: a type lands under every non-GLOBAL region
  // it has a pattern for (a shared concept like National ID can appear under more
  // than one country), plus a trailing "Global" group for region-agnostic types
  // (Email Address, Credit Card Details, ...). Group order follows `regions`
  // (KSA/GLOBAL today, Canada added alongside it) rather than hardcoding countries.
  const countryGroups = regions.filter((r) => r.regionCode !== "GLOBAL");
  const typesByRegion = (regionCode: string) => types.filter((t) => t.regions.includes(regionCode));
  const globalOnlyTypes = types.filter((t) => t.regions.length === 0);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => (s ? { ...s, [key]: value } : s));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">Sensitive Information Types</h2>
        <p className="text-xs text-muted mt-1">
          A standalone catalog of detectable sensitive-info values (National ID, Email Address, IBAN, ...),
          independent of the Business Glossary. Business terms get associated with a catalog value from their
          own Term Edit page — that association is what makes a term eligible for automatic pattern-based
          column detection, once it's confirmed a Business asset. Switching the active region changes which
          pattern set applies without touching any association — Canada (or any other region) is added as new
          pattern rows against the same catalog values. The catalog below is grouped by country; the checkbox
          on each type is a separate, coarser switch for "not relevant to this customer at all" — use it (or a
          group's Enable/Disable all) to turn off a whole country's types rather than every pattern one by one.
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
        </div>

        {/* Term assignment weights: everything that turns pattern matches into the
            confidence of a suggested term. */}
        <div className="border-t border-line pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-ink">Term Assignment Weights</h3>
            <button type="button" onClick={resetWeights}
              disabled={WEIGHT_KEYS.every((k) => Number(settings[k]) === DEFAULT_TERM_ASSIGNMENT_WEIGHTS[k])}
              className="btn btn-sm text-xs disabled:opacity-40" title="Puts the default values back in the fields below — press Save Settings to apply">
              Reset to defaults
            </button>
          </div>
          <p className="text-[11px] text-muted mt-1 leading-relaxed">
            How a suggested term&apos;s confidence is worked out. Each pattern has its own weight (edit it on the pattern, in
            the catalog below). A column&apos;s confidence for a term is the sum of the patterns that match, capped at 1:
            a name pattern adds its weight, a value or checksum pattern adds its weight times the share of sampled values
            that match. The settings here scale and band that result.
          </p>

          <div className="text-[11px] font-semibold text-ink mt-4 mb-2">Weight by kind of evidence <span className="font-normal text-muted">— multiplies every pattern of that kind (1 = the pattern&apos;s own weight)</span></div>
          <div className="grid grid-cols-3 gap-4">
            {([
              ["nameWeightFactor", "Column name match", "Name, friendly name and description"],
              ["valueWeightFactor", "Sampled value match", "Values matching a value pattern"],
              ["checksumWeightFactor", "Checksum match", "Luhn, IBAN, national ID…"],
            ] as const).map(([key, label, hint]) => (
              <div key={key}>
                <label className="block text-[11px] text-muted mb-1">{label}</label>
                <input type="number" step="0.05" min="0" max="5" value={settings[key]}
                  onChange={(e) => set(key, Number(e.target.value))}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
                <div className="text-[10px] text-muted mt-1">{hint}</div>
                <DefaultHint value={settings[key]} k={key} />
              </div>
            ))}
          </div>

          <div className="text-[11px] font-semibold text-ink mt-5 mb-2">Confidence levels</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] text-muted mb-1">Minimum to suggest</label>
              <input type="number" step="0.05" min="0" max="1" value={settings.minConfidenceThreshold}
                onChange={(e) => set("minConfidenceThreshold", Number(e.target.value))}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
              <div className="text-[10px] text-muted mt-1">Below this, no term is suggested</div>
              <DefaultHint value={settings.minConfidenceThreshold} k="minConfidenceThreshold" />
            </div>
            <div>
              <label className="block text-[11px] text-muted mb-1">MEDIUM from</label>
              <input type="number" step="0.05" min="0" max="1" value={settings.mediumBandThreshold}
                onChange={(e) => set("mediumBandThreshold", Number(e.target.value))}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
              <div className="text-[10px] text-muted mt-1">Below this a suggestion is LOW</div>
              <DefaultHint value={settings.mediumBandThreshold} k="mediumBandThreshold" />
            </div>
            <div>
              <label className="block text-[11px] text-muted mb-1">HIGH from</label>
              <input type="number" step="0.05" min="0" max="1" value={settings.highBandThreshold}
                onChange={(e) => set("highBandThreshold", Number(e.target.value))}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
              <div className="text-[10px] text-muted mt-1">The level auto-accept applies to</div>
              <DefaultHint value={settings.highBandThreshold} k="highBandThreshold" />
            </div>
          </div>
          {settings.mediumBandThreshold > settings.highBandThreshold && (
            <p className="text-[11px] text-red-600 mt-2">The MEDIUM level can&apos;t be higher than the HIGH level.</p>
          )}

          <div className="text-[11px] font-semibold text-ink mt-5 mb-2">When values can&apos;t be sampled</div>
          <div>
            <label className="block text-[11px] text-muted mb-1">Name-only Match Weight</label>
            <input type="number" step="0.05" min="0" max="1" value={settings.nameOnlyMatchWeight}
              onChange={(e) => set("nameOnlyMatchWeight", Number(e.target.value))}
              className="w-40 border border-line rounded-lg px-3 py-2 text-sm" />
            <DefaultHint value={settings.nameOnlyMatchWeight} k="nameOnlyMatchWeight" />
            <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
              The least confidence a column-name match gets when a table has no live connection, so the name is the only
              evidence.{" "}
              {settings.nameOnlyMatchWeight >= settings.highBandThreshold
                ? <span className="text-amber-700 font-semibold">At this value a name match alone is HIGH{settings.autoAcceptBand === "HIGH" ? " — and will be auto-accepted." : "."}</span>
                : settings.nameOnlyMatchWeight >= settings.mediumBandThreshold
                  ? <span>At this value a name match alone is MEDIUM and always waits for review.</span>
                  : <span>At this value a name match alone is LOW.</span>}{" "}
              Where values can be sampled, the weights above apply instead.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Save Settings"}</button>
          {saved && <span className="text-xs text-green-700 font-semibold">✓ Saved</span>}
          {saveError && <span className="text-xs text-red-600 font-semibold">{saveError}</span>}
        </div>
      </div>

      <div className="mt-6 max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-ink">SIT Type Catalog ({types.length})</div>
          <button onClick={() => setAdding((v) => !v)} className="text-[11px] font-semibold text-brand-purple hover:underline">
            {adding ? "Cancel" : "+ New SIT Type"}
          </button>
        </div>

        {adding && (
          <div className="bg-white border border-dashed border-line rounded-xl p-3 mb-2 flex items-center gap-2 flex-wrap">
            <input
              type="text" value={newType.sitName} onChange={(e) => setNewType((t) => ({ ...t, sitName: e.target.value }))}
              placeholder="Name, e.g. Driver's License Number" className="text-[12px] border border-line rounded px-2 py-1.5 flex-1 min-w-[180px]"
            />
            <select value={newType.classificationCode} onChange={(e) => setNewType((t) => ({ ...t, classificationCode: e.target.value }))} className="text-[12px] border border-line rounded px-2 py-1.5">
              {CLASSIFICATION_OPTIONS.map((c) => <option key={c} value={c}>{c || "— classification —"}</option>)}
            </select>
            <input
              type="text" value={newType.description} onChange={(e) => setNewType((t) => ({ ...t, description: e.target.value }))}
              placeholder="Description (optional)" className="text-[12px] border border-line rounded px-2 py-1.5 flex-1 min-w-[180px]"
            />
            <button onClick={createType} className="text-[12px] font-semibold text-white bg-brand-purple rounded px-3 py-1.5">Create</button>
            {addError && <div className="text-[11px] text-red-600 w-full">{addError}</div>}
          </div>
        )}

        {types.length === 0 ? (
          <div className="bg-white border border-line rounded-xl px-4 py-3 text-xs text-muted">No SIT types defined yet — create one above.</div>
        ) : (
          <div className="space-y-4">
            {countryGroups.map((region) => (
              <TypeGroup
                key={region.regionCode}
                title={region.regionNameText}
                types={typesByRegion(region.regionCode)}
                regions={regions}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                onPatchType={patchType}
                onRemoveType={removeType}
                onBulkSetEnabled={(enabled) => setRegionEnabled(region.regionCode, enabled)}
              />
            ))}
            {globalOnlyTypes.length > 0 && (
              <TypeGroup
                title="Global (all regions)"
                types={globalOnlyTypes}
                regions={regions}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                onPatchType={patchType}
                onRemoveType={removeType}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypeGroup({ title, types, regions, expandedId, onToggleExpand, onPatchType, onRemoveType, onBulkSetEnabled }: {
  title: string; types: SitType[]; regions: Region[]; expandedId: number | null;
  onToggleExpand: (id: number) => void;
  onPatchType: (id: number, body: Record<string, unknown>) => void;
  onRemoveType: (id: number) => void;
  onBulkSetEnabled?: (enabled: boolean) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{title} ({types.length})</div>
        {onBulkSetEnabled && (
          <div className="flex items-center gap-2">
            <button onClick={() => onBulkSetEnabled(true)} className="text-[11px] text-brand-purple hover:underline">Enable all</button>
            <span className="text-muted text-[11px]">·</span>
            <button onClick={() => onBulkSetEnabled(false)} className="text-[11px] text-muted hover:underline">Disable all</button>
          </div>
        )}
      </div>
      <div className="bg-white border border-line rounded-xl divide-y divide-line-soft">
        {types.map((t) => (
          <div key={t.sitTypeId}>
            <div
              onClick={() => onToggleExpand(t.sitTypeId)}
              className={`w-full flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-canvas-soft ${!t.isEnabled ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <input
                  type="checkbox" checked={t.isEnabled}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onPatchType(t.sitTypeId, { is_enabled: e.target.checked })}
                  className="w-3.5 h-3.5 accent-brand-purple shrink-0" title="Relevant to this customer"
                />
                <span className="text-sm text-ink truncate">{t.sitName}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <select
                  value={t.classificationCode ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onPatchType(t.sitTypeId, { classification_code: e.target.value || null })}
                  className="text-[10px] font-semibold border border-line rounded-full px-1.5 py-0.5 bg-canvas-soft text-muted"
                >
                  {CLASSIFICATION_OPTIONS.map((c) => <option key={c} value={c}>{c || "— none —"}</option>)}
                </select>
                <span className="text-[11px] text-muted">{t.patternCount} pattern{t.patternCount !== 1 ? "s" : ""}</span>
                <span onClick={(e) => { e.stopPropagation(); onRemoveType(t.sitTypeId); }} className="text-[11px] text-red-600 hover:underline">Delete</span>
                <span className="text-muted text-[11px]">{expandedId === t.sitTypeId ? "▲" : "▼"}</span>
              </div>
            </div>
            {expandedId === t.sitTypeId && <SitTypePatternEditor sitType={t} regions={regions} />}
          </div>
        ))}
      </div>
    </div>
  );
}
