"use client";

import { useState, useEffect } from "react";
import { UiTranslationsSection } from "./UiTranslationsSection";
import { ComplianceConfigSection } from "./ComplianceConfigSection";
import { LanguageSettingsSection } from "./LanguageSettingsSection";
import { DataCategoriesTab } from "@/components/retention/DataCategoriesTab";
import { useLang } from "@/lib/lang-context";

type AppLookup = {
  lookupId: number; lookupGroup: string; lookupCode: string;
  lookupLabel: string; labelAr: string | null;
  description: string | null; sortOrder: number; isActive: boolean; isSystem: boolean;
};

type GroupEntry = { group: string; count: number };

const GROUP_LABELS: Record<string, string> = {
  TABLE_TYPE:      "Table Types",
  ASSET_TYPE:      "Asset Types",
  CLASSIFICATION:  "Data Classification",
  DATA_DOMAIN:     "Data Domains",
  DQ_DIMENSION:    "DQ Dimensions",
  DQ_SEVERITY:     "DQ Severity",
  GOVERNANCE_ROLE: "Governance Roles",
};

// Groups managed outside app_lookups — excluded from the flat lookup list
const EXCLUDED_GROUPS = new Set(["DATASET_CATEGORY"]);

const BLANK = { lookupCode: "", lookupLabel: "", labelAr: "", description: "", sortOrder: 0, isActive: true };

export default function ConfigurationPage() {
  const { reloadLookups } = useLang();

  const [groups, setGroups]             = useState<GroupEntry[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showUiTranslations, setShowUiTranslations]   = useState(false);
  const [showComplianceConfig, setShowComplianceConfig] = useState(false);
  const [showLanguageSettings, setShowLanguageSettings] = useState(false);
  const [showDataCategories, setShowDataCategories]     = useState(false);

  const [newGroupName, setNewGroupName] = useState("");
  const [lookups, setLookups]           = useState<AppLookup[]>([]);
  const [editingId, setEditingId]       = useState<number | null>(null);
  const [editForm, setEditForm]         = useState({ lookupLabel: "", labelAr: "", description: "", sortOrder: 0, isActive: true });
  const [adding, setAdding]             = useState(false);
  const [addForm, setAddForm]           = useState({ ...BLANK });
  const [saving, setSaving]             = useState(false);

  async function loadGroups() {
    const r = await fetch("/api/admin/lookups?groupsOnly=true");
    const all: GroupEntry[] = await r.json();
    setGroups(all.filter((g) => !EXCLUDED_GROUPS.has(g.group)));
  }

  async function loadLookups(group: string) {
    const r = await fetch(`/api/admin/lookups?group=${encodeURIComponent(group)}`);
    setLookups(await r.json());
  }

  useEffect(() => { loadGroups(); }, []);

  useEffect(() => {
    if (selectedGroup) {
      setLookups([]);
      setEditingId(null);
      setAdding(false);
      loadLookups(selectedGroup);
    }
  }, [selectedGroup]);

  function resetNav() {
    setShowUiTranslations(false);
    setShowComplianceConfig(false);
    setShowLanguageSettings(false);
    setShowDataCategories(false);
    setAdding(false);
  }

  function selectGroup(g: string) {
    setSelectedGroup(g);
    resetNav();
  }

  function startEdit(l: AppLookup) {
    setEditingId(l.lookupId);
    setEditForm({
      lookupLabel: l.lookupLabel,
      labelAr:     l.labelAr ?? "",
      description: l.description ?? "",
      sortOrder:   l.sortOrder,
      isActive:    l.isActive,
    });
  }

  async function handleSaveEdit(id: number) {
    setSaving(true);
    try {
      await fetch(`/api/admin/lookups/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookupLabel: editForm.lookupLabel,
          labelAr:     editForm.labelAr || null,
          description: editForm.description || null,
          sortOrder:   editForm.sortOrder,
          isActive:    editForm.isActive,
        }),
      });
      setEditingId(null);
      await loadLookups(selectedGroup!);
      await loadGroups();
      reloadLookups();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this lookup value?")) return;
    const r = await fetch(`/api/admin/lookups/${id}`, { method: "DELETE" });
    const data = await r.json();
    if (!r.ok) { alert(data.error); return; }
    await loadLookups(selectedGroup!);
    await loadGroups();
    reloadLookups();
  }

  async function handleAdd() {
    if (!addForm.lookupCode || !addForm.lookupLabel) { alert("Code and Label (EN) are required"); return; }
    const group = selectedGroup ?? newGroupName.trim().toUpperCase().replace(/\s+/g, "_");
    if (!group) { alert("Select or enter a group"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/lookups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookupGroup:  group,
          lookupCode:   addForm.lookupCode.trim().toUpperCase().replace(/\s+/g, "_"),
          lookupLabel:  addForm.lookupLabel,
          labelAr:      addForm.labelAr || null,
          description:  addForm.description || null,
          sortOrder:    Number(addForm.sortOrder),
          isActive:     addForm.isActive,
        }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error); return; }
      setAdding(false);
      setAddForm({ ...BLANK });
      setNewGroupName("");
      if (!selectedGroup) setSelectedGroup(group);
      await loadLookups(selectedGroup ?? group);
      await loadGroups();
      reloadLookups();
    } finally { setSaving(false); }
  }

  const isNothingSelected =
    !selectedGroup && !adding && !showUiTranslations &&
    !showComplianceConfig && !showLanguageSettings && !showDataCategories;

  return (
    <div className="flex h-[calc(100vh-120px)] overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 border-r border-line bg-canvas flex flex-col">
        <div className="p-4 border-b border-line">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Configuration</span>
        </div>
        <div className="flex-1 overflow-y-auto">

          {/* ── Language Settings (pinned) */}
          <button
            onClick={() => { resetNav(); setSelectedGroup(null); setShowLanguageSettings(true); }}
            className={`w-full text-left px-4 py-3 border-b border-line text-sm transition-colors hover:bg-white ${showLanguageSettings ? "bg-white border-l-2 border-l-brand-purple" : ""}`}
          >
            <div className="font-medium text-ink">Language Settings</div>
            <div className="text-[10px] text-muted mt-0.5">Second language · Direction · Auto-translate</div>
          </button>

          {/* ── UI Translations (pinned) */}
          <button
            onClick={() => { resetNav(); setSelectedGroup(null); setShowUiTranslations(true); }}
            className={`w-full text-left px-4 py-3 border-b border-line text-sm transition-colors hover:bg-white ${showUiTranslations ? "bg-white border-l-2 border-l-brand-purple" : ""}`}
          >
            <div className="font-medium text-ink">UI Translations</div>
            <div className="text-[10px] text-muted mt-0.5">English overrides · Second language labels</div>
          </button>

          {/* ── Lookup Groups header + add */}
          <div className="px-4 py-2 text-[10px] font-semibold text-muted uppercase tracking-wider border-b border-line bg-canvas-soft flex items-center justify-between">
            <span>Lookup Groups</span>
            <button
              onClick={() => { setSelectedGroup(null); resetNav(); setAdding(true); setAddForm({ ...BLANK }); }}
              className="text-brand-purple hover:underline font-semibold text-[11px]"
            >+ Add</button>
          </div>

          {groups.map(g => (
            <button key={g.group}
              onClick={() => selectGroup(g.group)}
              className={`w-full text-left px-4 py-3 border-b border-line text-sm transition-colors hover:bg-white ${selectedGroup === g.group ? "bg-white border-l-2 border-l-brand-purple" : ""}`}
            >
              <div className="font-medium text-ink truncate">{GROUP_LABELS[g.group] ?? g.group}</div>
              <div className="text-[10px] text-muted mt-0.5 font-mono">{g.group} · {g.count}</div>
            </button>
          ))}
          {groups.length === 0 && <div className="p-4 text-xs text-muted">No lookup groups yet</div>}

          {/* ── Data Management section */}
          <div className="px-4 py-2 text-[10px] font-semibold text-muted uppercase tracking-wider border-b border-t border-line bg-canvas-soft">
            Data Management
          </div>
          <button
            onClick={() => { resetNav(); setSelectedGroup(null); setShowDataCategories(true); }}
            className={`w-full text-left px-4 py-3 border-b border-line text-sm transition-colors hover:bg-white ${showDataCategories ? "bg-white border-l-2 border-l-brand-purple" : ""}`}
          >
            <div className="font-medium text-ink">Data Categories</div>
            <div className="text-[10px] text-muted mt-0.5">Open Data · Privacy · Retention</div>
          </button>

          {/* ── Compliance section */}
          <div className="px-4 py-2 text-[10px] font-semibold text-muted uppercase tracking-wider border-b border-t border-line bg-canvas-soft">
            Compliance
          </div>
          <button
            onClick={() => { resetNav(); setSelectedGroup(null); setShowComplianceConfig(true); }}
            className={`w-full text-left px-4 py-3 border-b border-line text-sm transition-colors hover:bg-white ${showComplianceConfig ? "bg-white border-l-2 border-l-brand-purple" : ""}`}
          >
            <div className="font-medium text-ink">Compliance Config</div>
            <div className="text-[10px] text-muted mt-0.5">Levels · Statuses · Domains</div>
          </button>
        </div>
      </aside>

      {/* ── Main panel ───────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-8">

        {/* ── Language Settings panel ── */}
        {showLanguageSettings && <LanguageSettingsSection />}

        {/* ── UI Translations panel ── */}
        {showUiTranslations && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-bold text-ink">UI Translations</h2>
              <p className="text-xs text-muted mt-1">
                Override any default English string or add Arabic translations for the language toggle.
                Changes take effect immediately for all users after saving.
              </p>
            </div>
            <UiTranslationsSection />
          </div>
        )}

        {/* ── Compliance Config panel ── */}
        {showComplianceConfig && <ComplianceConfigSection />}

        {/* ── Data Categories panel ── */}
        {showDataCategories && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-bold text-ink">Data Categories</h2>
              <p className="text-xs text-muted mt-1">
                Manage the shared category taxonomy used across Open Data, Privacy, and Retention.
                Root categories can have sub-categories. Changes appear immediately in all modules.
              </p>
            </div>
            <DataCategoriesTab />
          </div>
        )}

        {/* ── Empty state ── */}
        {isNothingSelected && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="text-6xl">⚙️</div>
            <h2 className="text-xl font-semibold text-ink">Application Configuration</h2>
            <p className="text-muted text-sm max-w-md">
              Configure bilingual labels for all list-of-values used across the platform —
              classification codes, severity levels, governance roles, DQ dimensions, and more.
              Select a group from the sidebar, or manage UI string translations.
            </p>
          </div>
        )}

        {/* ── Add new lookup (new group form) ── */}
        {adding && !selectedGroup && (
          <div className="max-w-lg">
            <h2 className="text-lg font-bold text-ink mb-6">Add New Lookup Value</h2>
            <div className="bg-white border border-line rounded-xl p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Group (select existing or type new)</label>
                <input className="input w-full" placeholder="e.g. SENSITIVITY_LEVEL" value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)} />
                {groups.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {groups.map(g => (
                      <button key={g.group} onClick={() => { setSelectedGroup(g.group); setAdding(true); }}
                        className="text-[11px] px-2 py-1 rounded bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20">
                        {GROUP_LABELS[g.group] ?? g.group}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <AddFields form={addForm} onChange={setAddForm} />
              <div className="flex gap-3 pt-2">
                <button onClick={handleAdd} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Add Value"}</button>
                <button onClick={() => setAdding(false)} className="btn">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Lookups table for selected group ── */}
        {selectedGroup && (
          <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-ink">{GROUP_LABELS[selectedGroup] ?? selectedGroup}</h2>
                <p className="text-xs text-muted font-mono mt-0.5">{selectedGroup} · {lookups.length} values</p>
              </div>
              <button onClick={() => { setAdding(true); setAddForm({ ...BLANK }); }}
                className="btn btn-primary btn-sm">+ Add Value</button>
            </div>

            {adding && (
              <div className="bg-white border border-brand-purple rounded-xl p-5 mb-4 space-y-4">
                <h3 className="text-sm font-semibold text-ink">New Value in {GROUP_LABELS[selectedGroup] ?? selectedGroup}</h3>
                <AddFields form={addForm} onChange={setAddForm} />
                <div className="flex gap-3">
                  <button onClick={handleAdd} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Add"}</button>
                  <button onClick={() => setAdding(false)} className="btn btn-sm">Cancel</button>
                </div>
              </div>
            )}

            <div className="card overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[80px_1fr_1fr_60px_70px] gap-3 px-5 py-2.5 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
                <div>Code</div>
                <div>English Label</div>
                <div>Arabic Label (عربي)</div>
                <div>Active</div>
                <div>Actions</div>
              </div>

              {lookups.map(l => (
                <div key={l.lookupId} className="border-b border-line-soft last:border-b-0">
                  {editingId === l.lookupId ? (
                    <div className="px-5 py-4 space-y-3 bg-blue-50/40">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-brand-deep font-semibold bg-brand-purple/10 px-2 py-0.5 rounded">{l.lookupCode}</span>
                        {l.isSystem && <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded">system</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Label (EN) *</label>
                          <input className="input w-full" value={editForm.lookupLabel}
                            onChange={e => setEditForm(f => ({ ...f, lookupLabel: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">التسمية (AR)</label>
                          <input className="input w-full" dir="rtl" value={editForm.labelAr}
                            onChange={e => setEditForm(f => ({ ...f, labelAr: e.target.value }))} />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Description</label>
                          <input className="input w-full" value={editForm.description}
                            onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Sort Order</label>
                          <input type="number" className="input w-full" value={editForm.sortOrder}
                            onChange={e => setEditForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} />
                        </div>
                        <div className="flex items-center gap-2 pt-5">
                          <input type="checkbox" checked={editForm.isActive}
                            onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))}
                            className="w-4 h-4 accent-brand-purple" />
                          <label className="text-sm text-ink">Active</label>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => handleSaveEdit(l.lookupId)} disabled={saving} className="btn btn-primary btn-sm">
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setEditingId(null)} className="btn btn-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className={`grid grid-cols-[80px_1fr_1fr_60px_70px] gap-3 px-5 py-3.5 items-center hover:bg-canvas-soft ${!l.isActive ? "opacity-50" : ""}`}>
                      <div className="font-mono text-[11px] text-brand-deep font-semibold">{l.lookupCode}</div>
                      <div className="font-medium text-sm text-ink">
                        {l.lookupLabel}
                        {l.isSystem && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded">sys</span>}
                      </div>
                      <div>
                        {l.labelAr
                          ? <span className="font-medium text-sm text-ink" dir="rtl">{l.labelAr}</span>
                          : <span className="text-muted text-[11px] italic">Not set</span>}
                      </div>
                      <div className="text-center text-sm">
                        {l.isActive
                          ? <span className="text-green-600 font-bold">✓</span>
                          : <span className="text-gray-400">✗</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => startEdit(l)} className="btn btn-sm text-xs">Edit</button>
                        {!l.isSystem && (
                          <button onClick={() => handleDelete(l.lookupId)} className="btn btn-sm text-xs text-red-600 hover:bg-red-50">Del</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {lookups.length === 0 && (
                <div className="py-10 text-center text-muted text-sm">No values in this group yet.</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function AddFields({
  form,
  onChange,
}: {
  form: typeof BLANK;
  onChange: (f: typeof BLANK) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Code *</label>
        <input className="input w-full font-mono" placeholder="MY_CODE" value={form.lookupCode}
          onChange={e => onChange({ ...form, lookupCode: e.target.value })} />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Sort Order</label>
        <input type="number" className="input w-full" value={form.sortOrder}
          onChange={e => onChange({ ...form, sortOrder: Number(e.target.value) })} />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Label (EN) *</label>
        <input className="input w-full" placeholder="My Label" value={form.lookupLabel}
          onChange={e => onChange({ ...form, lookupLabel: e.target.value })} />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">التسمية (AR)</label>
        <input className="input w-full" dir="rtl" placeholder="التسمية بالعربي" value={form.labelAr}
          onChange={e => onChange({ ...form, labelAr: e.target.value })} />
      </div>
      <div className="col-span-2">
        <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Description</label>
        <input className="input w-full" placeholder="Optional description" value={form.description}
          onChange={e => onChange({ ...form, description: e.target.value })} />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <input type="checkbox" checked={form.isActive}
          onChange={e => onChange({ ...form, isActive: e.target.checked })}
          className="w-4 h-4 accent-brand-purple" />
        <label className="text-sm text-ink">Active</label>
      </div>
    </div>
  );
}
