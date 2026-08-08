"use client";

import { useState, useEffect, useCallback } from "react";
import { LANGUAGE_REGISTRY } from "@/lib/lang-config";
import { useLang } from "@/lib/lang-context";

type Language = {
  languageCode: string; languageNameText: string; orientationCode: "LTR" | "RTL";
  isEnabled: boolean; isDefault: boolean; coveragePct: number | null;
};
type Policy = { selfSelectionEnabled: boolean; choosableCodes: string[] | null; coverageThresholdPct: number };

const TABS = ["Languages", "Categories", "Workbench", "Import / Export"] as const;
type Tab = (typeof TABS)[number];

export function LanguagesAdminClient() {
  const [tab, setTab] = useState<Tab>("Languages");
  const [workbenchCategory, setWorkbenchCategory] = useState<string | null>(null);
  const [workbenchLang, setWorkbenchLang] = useState<string | null>(null);

  return (
    <div>
      <div className="flex gap-1 border-b border-line mb-6">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === tb ? "border-brand-purple text-brand-purple" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tb}
          </button>
        ))}
      </div>

      {tab === "Languages" && <LanguagesTab />}
      {tab === "Categories" && (
        <CategoriesTab
          onOpenWorkbench={(categoryCode, languageCode) => {
            setWorkbenchCategory(categoryCode);
            setWorkbenchLang(languageCode);
            setTab("Workbench");
          }}
        />
      )}
      {tab === "Workbench" && <WorkbenchTab initialCategory={workbenchCategory} initialLang={workbenchLang} />}
      {tab === "Import / Export" && <ImportExportTab />}
    </div>
  );
}

// ── Languages tab ────────────────────────────────────────────────────────────────

function LanguagesTab() {
  const { reloadLanguages } = useLang();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [addCode, setAddCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [langRes, policyRes] = await Promise.all([
        fetch("/api/admin/languages"),
        fetch("/api/admin/languages/policy"),
      ]);
      if (langRes.ok) setLanguages(await langRes.json());
      if (policyRes.ok) setPolicy(await policyRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const existingCodes = new Set(languages.map((l) => l.languageCode));
  const addableRegistry = LANGUAGE_REGISTRY.filter((l) => !existingCodes.has(l.code));

  async function addLanguage() {
    const entry = LANGUAGE_REGISTRY.find((l) => l.code === addCode);
    if (!entry) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/languages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          languageCode: entry.code, languageNameText: entry.nativeName,
          orientationCode: entry.direction === "rtl" ? "RTL" : "LTR",
        }),
      });
      if (!r.ok) { const e = await r.json(); setMsg(e.error ?? "Failed to add language"); return; }
      setAddCode("");
      await load();
      reloadLanguages();
    } finally { setSaving(false); }
  }

  async function toggleEnabled(l: Language) {
    setSaving(true);
    try {
      await fetch(`/api/admin/languages/${l.languageCode}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !l.isEnabled }),
      });
      await load();
      reloadLanguages();
    } finally { setSaving(false); }
  }

  async function setDefault(code: string) {
    setSaving(true);
    try {
      await fetch(`/api/admin/languages/${code}/set-default`, { method: "POST" });
      await load();
      reloadLanguages();
    } finally { setSaving(false); }
  }

  async function savePolicy(patch: Partial<Policy>) {
    if (!policy) return;
    const next = { ...policy, ...patch };
    setPolicy(next);
    setSaving(true);
    try {
      await fetch("/api/admin/languages/policy", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      reloadLanguages();
    } finally { setSaving(false); }
  }

  function toggleChoosable(code: string) {
    if (!policy) return;
    const current = policy.choosableCodes ?? languages.map((l) => l.languageCode);
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    savePolicy({ choosableCodes: next });
  }

  if (loading) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[80px_1fr_90px_100px_90px_110px] gap-3 px-5 py-2.5 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
          <div>Code</div><div>Language</div><div>Direction</div><div>Coverage</div><div>Enabled</div><div>Default</div>
        </div>
        {languages.map((l) => (
          <div key={l.languageCode} className="grid grid-cols-[80px_1fr_90px_100px_90px_110px] gap-3 px-5 py-3 items-center border-b border-line-soft last:border-b-0">
            <div className="font-mono text-[11px] text-brand-deep font-semibold">{l.languageCode}</div>
            <div className="text-sm font-medium text-ink">{l.languageNameText}</div>
            <div className="text-xs text-muted">{l.orientationCode}</div>
            <div className="text-xs">
              {l.languageCode === "en" ? (
                <span className="text-muted">base</span>
              ) : (
                <span className={l.coveragePct != null && l.coveragePct >= 95 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                  {l.coveragePct ?? 0}%
                </span>
              )}
            </div>
            <div>
              {l.languageCode === "en" ? (
                <span className="text-[11px] text-muted italic">always</span>
              ) : (
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={l.isEnabled} disabled={saving || l.isDefault} onChange={() => toggleEnabled(l)} className="w-4 h-4 accent-brand-purple" />
                </label>
              )}
            </div>
            <div>
              {l.isDefault ? (
                <span className="text-[11px] font-semibold text-brand-purple">Default</span>
              ) : (
                <button onClick={() => setDefault(l.languageCode)} disabled={saving} className="text-[11px] text-brand-purple hover:underline font-semibold">
                  Set default
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-bold text-ink mb-3">Add a language</h3>
        {addableRegistry.length === 0 ? (
          <p className="text-xs text-muted">Every predefined language is already added.</p>
        ) : (
          <div className="flex items-center gap-3">
            <select value={addCode} onChange={(e) => setAddCode(e.target.value)} className="input flex-1 max-w-xs">
              <option value="">Select a language…</option>
              {addableRegistry.map((l) => (
                <option key={l.code} value={l.code}>{l.displayName} ({l.nativeName})</option>
              ))}
            </select>
            <button onClick={addLanguage} disabled={!addCode || saving} className="btn btn-primary btn-sm">
              {saving ? "Adding…" : "+ Add"}
            </button>
          </div>
        )}
        {msg && <p className="text-xs text-red-600 mt-2">{msg}</p>}
      </div>

      {policy && (
        <div className="card p-5">
          <h3 className="text-sm font-bold text-ink mb-3">Self-selection policy</h3>
          <label className="flex items-center gap-2 cursor-pointer mb-4">
            <input type="checkbox" checked={policy.selfSelectionEnabled} onChange={(e) => savePolicy({ selfSelectionEnabled: e.target.checked })} className="w-4 h-4 accent-brand-purple" />
            <span className="text-sm text-ink">Let users pick their own language</span>
          </label>
          {!policy.selfSelectionEnabled && (
            <p className="text-xs text-muted mb-4">Everyone sees the entity default language only — no picker is shown.</p>
          )}
          {policy.selfSelectionEnabled && (
            <>
              <div className="mb-4">
                <label className="text-[10px] font-semibold text-muted uppercase mb-1.5 block">Choosable languages</label>
                <div className="flex flex-wrap gap-2">
                  {languages.filter((l) => l.isEnabled).map((l) => {
                    const choosable = policy.choosableCodes == null || policy.choosableCodes.includes(l.languageCode);
                    return (
                      <button
                        key={l.languageCode}
                        onClick={() => toggleChoosable(l.languageCode)}
                        disabled={l.languageCode === "en"}
                        className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition-colors ${
                          choosable ? "border-brand-purple text-brand-purple bg-brand-purple/5" : "border-line text-muted"
                        } ${l.languageCode === "en" ? "opacity-60" : ""}`}
                      >
                        {l.languageNameText}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted mt-1.5">All enabled languages are choosable when none are explicitly deselected.</p>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted uppercase mb-1.5 block">Minimum coverage to appear in the picker</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={100} value={policy.coverageThresholdPct}
                    onChange={(e) => savePolicy({ coverageThresholdPct: Number(e.target.value) })}
                    className="input w-24"
                  />
                  <span className="text-xs text-muted">%</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Categories tab ───────────────────────────────────────────────────────────────

type CoverageRow = {
  categoryCode: string; categoryNameText: string; domainCode: string; languageCode: string;
  totalKeys: number; missing: number; aiTranslated: number; humanEdited: number; verified: number; stale: number; coveredPct: number;
};

function CategoriesTab({ onOpenWorkbench }: { onOpenWorkbench: (categoryCode: string, languageCode: string) => void }) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [langRes, covRes] = await Promise.all([fetch("/api/admin/languages"), fetch("/api/admin/translations/coverage")]);
      if (langRes.ok) setLanguages(await langRes.json());
      if (covRes.ok) setCoverage(await covRes.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await fetch("/api/admin/translations/sync", { method: "POST" });
      const d = await r.json();
      setSyncMsg(`Synced list values: ${d.keysCreated} new, ${d.keysUpdatedStale} marked stale, ${d.arSeeded} Arabic values pre-filled.`);
      await load();
    } finally { setSyncing(false); }
  }

  if (loading) return <div className="text-sm text-muted">Loading…</div>;

  const targetLangs = languages.filter((l) => l.languageCode !== "en");
  const byCategory = new Map<string, { categoryNameText: string; domainCode: string; totalKeys: number; cells: Map<string, CoverageRow> }>();
  for (const row of coverage) {
    if (!byCategory.has(row.categoryCode)) byCategory.set(row.categoryCode, { categoryNameText: row.categoryNameText, domainCode: row.domainCode, totalKeys: row.totalKeys, cells: new Map() });
    byCategory.get(row.categoryCode)!.cells.set(row.languageCode, row);
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">Coverage per category. Click a cell to open the workbench filtered to it.</p>
        <button onClick={runSync} disabled={syncing} className="btn btn-sm">{syncing ? "Syncing…" : "Sync list values"}</button>
      </div>
      {syncMsg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5">{syncMsg}</p>}

      <div className="card overflow-x-auto">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr className="bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-right">Keys</th>
              {targetLangs.map((l) => (
                <th key={l.languageCode} className="px-4 py-2 text-right">{l.languageNameText}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...byCategory.entries()].map(([categoryCode, cat]) => (
              <tr key={categoryCode} className="border-b border-line-soft last:border-b-0 hover:bg-canvas-soft">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-ink">{cat.categoryNameText}</div>
                  <div className="text-[10px] text-muted font-mono">{categoryCode}</div>
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-muted">{cat.totalKeys}</td>
                {targetLangs.map((l) => {
                  const cell = cat.cells.get(l.languageCode);
                  const pct = cell?.coveredPct ?? 0;
                  return (
                    <td key={l.languageCode} className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => onOpenWorkbench(categoryCode, l.languageCode)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded hover:underline ${pct >= 95 ? "text-emerald-600" : pct > 0 ? "text-amber-600" : "text-muted"}`}
                      >
                        {pct}%
                      </button>
                      {cell && cell.stale > 0 && <div className="text-[10px] text-red-600">{cell.stale} stale</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {byCategory.size === 0 && (
              <tr><td colSpan={2 + targetLangs.length} className="px-4 py-8 text-center text-muted text-sm">No translation categories yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Workbench tab ────────────────────────────────────────────────────────────────

type WorkbenchRow = {
  keyId: number; keyCode: string; categoryCode: string; baseText: string; contextNoteText: string | null;
  translatedText: string | null; statusCode: "MISSING" | "AI_TRANSLATED" | "HUMAN_EDITED" | "VERIFIED" | "STALE";
};

const STATUS_STYLES: Record<WorkbenchRow["statusCode"], string> = {
  MISSING: "bg-gray-100 text-gray-600",
  AI_TRANSLATED: "bg-blue-100 text-blue-700",
  HUMAN_EDITED: "bg-purple-100 text-purple-700",
  VERIFIED: "bg-emerald-100 text-emerald-700",
  STALE: "bg-amber-100 text-amber-700",
};

function WorkbenchTab({ initialCategory, initialLang }: { initialCategory: string | null; initialLang: string | null }) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [lang, setLangSel] = useState<string>(initialLang ?? "");
  const [category, setCategory] = useState<string>(initialCategory ?? "");
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<WorkbenchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [wizardRunning, setWizardRunning] = useState(false);
  const [wizardProgress, setWizardProgress] = useState<{ done: number; total: number; translated: number; skipped: number; failed: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/languages").then((r) => r.ok ? r.json() : []).then((langs: Language[]) => {
      setLanguages(langs);
      if (!lang) {
        const firstTarget = langs.find((l) => l.languageCode !== "en");
        if (firstTarget) setLangSel(firstTarget.languageCode);
      }
    });
    fetch("/api/admin/translations/coverage").then((r) => r.ok ? r.json() : []).then((rows: { categoryCode: string }[]) => {
      setCategories([...new Set(rows.map((r) => r.categoryCode))].sort());
    });
  }, []); // eslint-disable-line

  const load = useCallback(async () => {
    if (!lang) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ lang });
      if (category) params.set("category", category);
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      const r = await fetch(`/api/admin/translations?${params.toString()}`);
      if (r.ok) setRows(await r.json());
      setSelected(new Set());
    } finally { setLoading(false); }
  }, [lang, category, status, search]);

  useEffect(() => { load(); }, [load]);

  function toggleSelect(keyId: number) {
    const next = new Set(selected);
    if (next.has(keyId)) next.delete(keyId); else next.add(keyId);
    setSelected(next);
  }

  async function saveEdit(row: WorkbenchRow) {
    const text = edits[row.keyId];
    if (text === undefined || text === row.translatedText) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/translations/${row.keyId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ languageCode: lang, text }),
      });
      await load();
    } finally { setBusy(false); }
  }

  async function verify(row: WorkbenchRow) {
    setBusy(true);
    try {
      await fetch(`/api/admin/translations/${row.keyId}/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ languageCode: lang }),
      });
      await load();
    } finally { setBusy(false); }
  }

  async function revert(row: WorkbenchRow) {
    if (!confirm(`Revert "${row.keyCode}" back to Missing? This deletes the current ${lang} translation.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/translations/${row.keyId}/revert`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ languageCode: lang }),
      });
      await load();
    } finally { setBusy(false); }
  }

  async function aiTranslateSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/translations/translate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyIds: [...selected], languageCode: lang }),
      });
      const d = await r.json();
      setMsg(`Translated ${d.translated}, skipped ${d.skipped} (already human-edited/verified)${d.failed?.length ? `, ${d.failed.length} failed` : ""}.`);
      await load();
    } finally { setBusy(false); }
  }

  async function translateEverything() {
    if (!lang || categories.length === 0) return;
    if (!confirm(`Run AI-translate across all ${categories.length} categories for ${lang.toUpperCase()}? Human-edited and verified rows are always skipped.`)) return;
    setWizardRunning(true);
    setWizardProgress({ done: 0, total: categories.length, translated: 0, skipped: 0, failed: 0 });
    for (const [i, cat] of categories.entries()) {
      try {
        const r = await fetch("/api/admin/translations/translate", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryCode: cat, languageCode: lang }),
        });
        const d = await r.json();
        setWizardProgress((prev) => prev && ({
          done: i + 1, total: categories.length,
          translated: prev.translated + (d.translated ?? 0), skipped: prev.skipped + (d.skipped ?? 0), failed: prev.failed + (d.failed?.length ?? 0),
        }));
      } catch {
        setWizardProgress((prev) => prev && ({ ...prev, done: i + 1 }));
      }
    }
    setWizardRunning(false);
    await load();
  }

  const targetLangs = languages.filter((l) => l.languageCode !== "en");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={lang} onChange={(e) => setLangSel(e.target.value)} className="input w-40">
          {targetLangs.map((l) => <option key={l.languageCode} value={l.languageCode}>{l.languageNameText}</option>)}
        </select>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category code (e.g. UI_NAV)" className="input w-52" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-40">
          <option value="">All statuses</option>
          <option value="MISSING">Missing</option>
          <option value="AI_TRANSLATED">AI Translated</option>
          <option value="HUMAN_EDITED">Human Edited</option>
          <option value="VERIFIED">Verified</option>
          <option value="STALE">Stale</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search key, text…" className="input flex-1 min-w-[180px]" />
        <button onClick={aiTranslateSelected} disabled={selected.size === 0 || busy} className="btn btn-primary btn-sm">
          {busy ? "Working…" : `AI-translate selected (${selected.size})`}
        </button>
        <button onClick={translateEverything} disabled={wizardRunning || busy} className="btn btn-sm">
          {wizardRunning ? "Translating everything…" : "Translate everything"}
        </button>
      </div>
      {wizardProgress && (
        <div className="text-xs bg-canvas-soft border border-line rounded-md px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
              <div className="h-full bg-brand-purple transition-all" style={{ width: `${(100 * wizardProgress.done) / wizardProgress.total}%` }} />
            </div>
            <span className="text-muted shrink-0">{wizardProgress.done}/{wizardProgress.total} categories</span>
          </div>
          <span className="text-ink-soft">{wizardProgress.translated} translated · {wizardProgress.skipped} skipped · {wizardProgress.failed} failed</span>
        </div>
      )}
      {msg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5">{msg}</p>}

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[28px_1fr_1fr_100px_140px] gap-3 px-4 py-2 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
          <div></div><div>Base (English)</div><div>Translation</div><div>Status</div><div>Actions</div>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center text-muted text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted text-sm">No keys match these filters.</div>
        ) : (
          rows.map((row) => (
            <div key={row.keyId} className="grid grid-cols-[28px_1fr_1fr_100px_140px] gap-3 px-4 py-2.5 items-start border-b border-line-soft last:border-b-0">
              <input type="checkbox" checked={selected.has(row.keyId)} onChange={() => toggleSelect(row.keyId)} className="w-4 h-4 accent-brand-purple mt-1" />
              <div>
                <div className="text-sm text-ink">{row.baseText}</div>
                <div className="text-[10px] text-muted font-mono">{row.keyCode}</div>
              </div>
              <textarea
                value={edits[row.keyId] ?? row.translatedText ?? ""}
                onChange={(e) => setEdits((prev) => ({ ...prev, [row.keyId]: e.target.value }))}
                onBlur={() => saveEdit(row)}
                dir="auto"
                rows={1}
                className="input text-sm resize-y"
              />
              <div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_STYLES[row.statusCode]}`}>{row.statusCode}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                {row.translatedText && row.statusCode !== "VERIFIED" && (
                  <button onClick={() => verify(row)} disabled={busy} className="text-emerald-700 hover:underline font-semibold">Verify</button>
                )}
                {row.statusCode !== "MISSING" && (
                  <button onClick={() => revert(row)} disabled={busy} className="text-red-600 hover:underline font-semibold">Revert</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ImportExportTab() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [lang, setLangSel] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ updated: number; skippedEmpty: number; notFound: string[] } | null>(null);

  useEffect(() => {
    fetch("/api/admin/languages").then((r) => r.ok ? r.json() : []).then((langs: Language[]) => {
      setLanguages(langs);
      const firstTarget = langs.find((l) => l.languageCode !== "en");
      if (firstTarget) setLangSel(firstTarget.languageCode);
    });
  }, []);

  async function doImport() {
    if (!file || !lang) return;
    setImporting(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("languageCode", lang);
      const r = await fetch("/api/admin/translations/import", { method: "POST", body: fd });
      setResult(await r.json());
    } finally { setImporting(false); }
  }

  const targetLangs = languages.filter((l) => l.languageCode !== "en");

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-end gap-3">
        <div>
          <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Language</label>
          <select value={lang} onChange={(e) => setLangSel(e.target.value)} className="input w-40">
            {targetLangs.map((l) => <option key={l.languageCode} value={l.languageCode}>{l.languageNameText}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Category (optional)</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. UI_NAV" className="input w-48" />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-bold text-ink mb-1">Export</h3>
        <p className="text-xs text-muted mb-3">Downloads key_code / category / base_text / context_note / translated_text / status columns for the selected language.</p>
        <a
          href={`/api/admin/translations/export?lang=${encodeURIComponent(lang)}${category ? `&category=${encodeURIComponent(category)}` : ""}`}
          className="btn btn-sm"
        >
          ⭳ Export XLSX
        </a>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-bold text-ink mb-1">Import</h3>
        <p className="text-xs text-muted mb-3">
          Upload an edited export. Only rows with a non-empty translated_text are applied, matched by key_code — everything else is left untouched. Applied rows become Human Edited and are audited.
        </p>
        <div className="flex items-center gap-3">
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
          <button onClick={doImport} disabled={!file || importing} className="btn btn-primary btn-sm">
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
        {result && (
          <div className="mt-3 text-xs bg-canvas-soft border border-line rounded-md px-3 py-2">
            <div className="text-emerald-700 font-semibold">{result.updated} translation(s) updated.</div>
            {result.skippedEmpty > 0 && <div className="text-muted">{result.skippedEmpty} row(s) skipped (empty translated_text).</div>}
            {result.notFound.length > 0 && (
              <div className="text-amber-700">Unknown key_code, skipped: {result.notFound.slice(0, 10).join(", ")}{result.notFound.length > 10 ? "…" : ""}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
