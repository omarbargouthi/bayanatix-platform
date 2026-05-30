"use client";

import { useState, useEffect } from "react";
import { UiTranslationsSection } from "./UiTranslationsSection";
import { DqDimensionsSection } from "./DqDimensionsSection";
import { ClassificationSection } from "./ClassificationSection";

type AppLookup = {
  lookupId: number; lookupGroup: string; lookupCode: string; lookupLabel: string;
  description: string | null; sortOrder: number; isActive: boolean; isSystem: boolean; createdAt: string;
};

type GroupEntry = { group: string; count: number };

type GovRole = { roleCode: string; name: string; description: string | null };

const GROUP_LABELS: Record<string, string> = {
  TABLE_TYPE:     "Table Type",
  ASSET_TYPE:     "Asset Type",
  CLASSIFICATION: "Classification",
  DATA_DOMAIN:    "Data Domain",
  DQ_DIMENSION:   "DQ Dimension",
};

const GOV_ROLE_ORDER = ["OWNER", "BIZ_STEWARD", "TECH_STEWARD"];

const BLANK = { lookupCode: "", lookupLabel: "", description: "", sortOrder: 0, isActive: true };

export default function ConfigurationPage() {
  const [groups, setGroups]       = useState<GroupEntry[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showGovRoles, setShowGovRoles]             = useState(false);
  const [showUiTranslations, setShowUiTranslations] = useState(false);
  const [showDqDims, setShowDqDims]                 = useState(false);
  const [showClassification, setShowClassification] = useState(false);
  const [newGroupName, setNewGroupName]   = useState("");
  const [lookups, setLookups]     = useState<AppLookup[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm]   = useState({ lookupLabel: "", description: "", sortOrder: 0, isActive: true });
  const [adding, setAdding]       = useState(false);
  const [addForm, setAddForm]     = useState({ ...BLANK });
  const [saving, setSaving]       = useState(false);

  // Governance role label state
  const [govRoles, setGovRoles]         = useState<GovRole[]>([]);
  const [govEditCode, setGovEditCode]   = useState<string | null>(null);
  const [govEditForm, setGovEditForm]   = useState({ name: "", description: "" });
  const [govSaving, setGovSaving]       = useState(false);
  const [govSaved, setGovSaved]         = useState<string | null>(null);

  async function loadGroups() {
    const r = await fetch("/api/admin/lookups?groupsOnly=true");
    setGroups(await r.json());
  }

  async function loadGovRoles() {
    const r = await fetch("/api/admin/governance-roles");
    if (r.ok) {
      const data: GovRole[] = await r.json();
      setGovRoles(data.sort((a, b) => GOV_ROLE_ORDER.indexOf(a.roleCode) - GOV_ROLE_ORDER.indexOf(b.roleCode)));
    }
  }

  function startGovEdit(role: GovRole) {
    setGovEditCode(role.roleCode);
    setGovEditForm({ name: role.name, description: role.description ?? "" });
  }

  async function saveGovRole(roleCode: string) {
    setGovSaving(true);
    try {
      const r = await fetch(`/api/admin/governance-roles/${roleCode}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: govEditForm.name, description: govEditForm.description || null }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error); return; }
      setGovEditCode(null);
      setGovSaved(roleCode);
      setTimeout(() => setGovSaved(null), 2000);
      await loadGovRoles();
    } finally { setGovSaving(false); }
  }

  async function loadLookups(group: string) {
    const r = await fetch(`/api/admin/lookups?group=${encodeURIComponent(group)}`);
    setLookups(await r.json());
  }

  useEffect(() => { loadGroups(); loadGovRoles(); }, []);

  useEffect(() => {
    if (selectedGroup) {
      setLookups([]);
      setEditingId(null);
      setAdding(false);
      loadLookups(selectedGroup);
    }
  }, [selectedGroup]);

  function startEdit(l: AppLookup) {
    setEditingId(l.lookupId);
    setEditForm({ lookupLabel: l.lookupLabel, description: l.description ?? "", sortOrder: l.sortOrder, isActive: l.isActive });
  }

  async function handleSaveEdit(id: number) {
    setSaving(true);
    try {
      await fetch(`/api/admin/lookups/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, description: editForm.description || null }),
      });
      setEditingId(null);
      await loadLookups(selectedGroup!);
      await loadGroups();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this lookup value?")) return;
    const r = await fetch(`/api/admin/lookups/${id}`, { method: "DELETE" });
    const data = await r.json();
    if (!r.ok) { alert(data.error); return; }
    await loadLookups(selectedGroup!);
    await loadGroups();
  }

  async function handleAdd() {
    if (!addForm.lookupCode || !addForm.lookupLabel) { alert("Code and Label are required"); return; }
    const group = selectedGroup ?? newGroupName.trim().toUpperCase().replace(/\s+/g, "_");
    if (!group) { alert("Select or enter a group"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/lookups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookupGroup: group, lookupCode: addForm.lookupCode.trim().toUpperCase().replace(/\s+/g, "_"),
          lookupLabel: addForm.lookupLabel, description: addForm.description || null,
          sortOrder: Number(addForm.sortOrder), isActive: addForm.isActive,
        }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error); return; }
      setAdding(false);
      setAddForm({ ...BLANK });
      setNewGroupName("");
      if (!selectedGroup) setSelectedGroup(group);
      await loadLookups(selectedGroup ?? group);
      await loadGroups();
    } finally { setSaving(false); }
  }

  return (
    <div className="flex h-[calc(100vh-120px)] overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 border-r border-line bg-canvas flex flex-col">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Configuration</span>
        </div>
        <div className="flex-1 overflow-y-auto">

          {/* ── Governance Roles (pinned) */}
          <button
            onClick={() => { setShowGovRoles(true); setSelectedGroup(null); setAdding(false); setShowUiTranslations(false); setShowDqDims(false); setShowClassification(false); }}
            className={`w-full text-left px-4 py-3 border-b border-line text-sm transition-colors hover:bg-white ${showGovRoles ? "bg-white border-l-2 border-l-brand-purple" : ""}`}
          >
            <div className="font-medium text-ink">Governance Roles</div>
            <div className="text-[10px] text-muted mt-0.5">Owner · Business Steward · Tech Steward</div>
          </button>

          {/* ── UI Translations (pinned) */}
          <button
            onClick={() => { setShowUiTranslations(true); setShowGovRoles(false); setShowDqDims(false); setShowClassification(false); setSelectedGroup(null); setAdding(false); }}
            className={`w-full text-left px-4 py-3 border-b border-line text-sm transition-colors hover:bg-white ${showUiTranslations ? "bg-white border-l-2 border-l-brand-purple" : ""}`}
          >
            <div className="font-medium text-ink">UI Translations</div>
            <div className="text-[10px] text-muted mt-0.5">English overrides · Arabic labels</div>
          </button>

          {/* ── DQ Dimensions (pinned) */}
          <button
            onClick={() => { setShowDqDims(true); setShowGovRoles(false); setShowUiTranslations(false); setShowClassification(false); setSelectedGroup(null); setAdding(false); }}
            className={`w-full text-left px-4 py-3 border-b border-line text-sm transition-colors hover:bg-white ${showDqDims ? "bg-white border-l-2 border-l-brand-purple" : ""}`}
          >
            <div className="font-medium text-ink">DQ Dimensions</div>
            <div className="text-[10px] text-muted mt-0.5">English &amp; Arabic names</div>
          </button>

          {/* ── Data Classification (pinned) */}
          <button
            onClick={() => { setShowClassification(true); setShowGovRoles(false); setShowUiTranslations(false); setShowDqDims(false); setSelectedGroup(null); setAdding(false); }}
            className={`w-full text-left px-4 py-3 border-b border-line text-sm transition-colors hover:bg-white ${showClassification ? "bg-white border-l-2 border-l-brand-purple" : ""}`}
          >
            <div className="font-medium text-ink">Data Classification</div>
            <div className="text-[10px] text-muted mt-0.5">English &amp; Arabic labels</div>
          </button>

          {/* Divider */}
          <div className="px-4 py-2 text-[10px] font-semibold text-muted uppercase tracking-wider border-b border-line bg-canvas-soft flex items-center justify-between">
            <span>Lookup Groups</span>
            <button onClick={() => { setSelectedGroup(null); setShowGovRoles(false); setShowUiTranslations(false); setShowDqDims(false); setShowClassification(false); setAdding(true); setAddForm({ ...BLANK }); }}
              className="text-brand-purple hover:underline font-semibold text-[11px]">+ Add</button>
          </div>

          {groups.map(g => (
            <button key={g.group} onClick={() => { setSelectedGroup(g.group); setShowGovRoles(false); setShowUiTranslations(false); setShowDqDims(false); setShowClassification(false); setAdding(false); }}
              className={`w-full text-left px-4 py-3 border-b border-line text-sm transition-colors hover:bg-white ${selectedGroup === g.group ? "bg-white border-l-2 border-l-brand-purple" : ""}`}>
              <div className="font-medium text-ink truncate">{GROUP_LABELS[g.group] ?? g.group}</div>
              <div className="text-[10px] text-muted mt-0.5 font-mono">{g.group} · {g.count} values</div>
            </button>
          ))}
          {groups.length === 0 && <div className="p-4 text-xs text-muted">No lookup groups yet</div>}
        </div>
      </aside>

      {/* ── Main panel ───────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-8">

        {/* ── Governance Roles panel ── */}
        {showGovRoles && (
          <div className="max-w-2xl">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-ink">Governance Roles</h2>
              <p className="text-xs text-muted mt-1">
                Customize the display names for the three governance roles used across assets, workflows, and data sources.
                The underlying role codes (OWNER, BIZ_STEWARD, TECH_STEWARD) remain fixed; only the names shown in the UI change.
              </p>
            </div>
            <div className="card divide-y divide-line">
              {govRoles.map((role) => (
                <div key={role.roleCode} className="px-5 py-4">
                  {govEditCode === role.roleCode ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-[11px] text-brand-deep font-semibold bg-brand-purple/10 px-2 py-0.5 rounded">{role.roleCode}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Display Name *</label>
                          <input className="input w-full" value={govEditForm.name}
                            onChange={e => setGovEditForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Description</label>
                          <input className="input w-full" value={govEditForm.description}
                            onChange={e => setGovEditForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => saveGovRole(role.roleCode)} disabled={govSaving} className="btn btn-primary btn-sm">
                          {govSaving ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setGovEditCode(null)} className="btn btn-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4">
                      <span className="font-mono text-[11px] text-brand-deep font-semibold bg-brand-purple/10 px-2 py-0.5 rounded mt-0.5 shrink-0">{role.roleCode}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold text-ink">{role.name}</span>
                          {govSaved === role.roleCode && <span className="text-xs text-green-600 font-semibold">✓ Saved</span>}
                        </div>
                        {role.description && <p className="text-[12px] text-muted mt-0.5">{role.description}</p>}
                      </div>
                      <button onClick={() => startGovEdit(role)} className="btn btn-sm shrink-0">Edit</button>
                    </div>
                  )}
                </div>
              ))}
              {govRoles.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-muted">Loading…</div>
              )}
            </div>
          </div>
        )}

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

        {/* ── DQ Dimensions panel ── */}
        {showDqDims && <DqDimensionsSection />}

        {/* ── Data Classification panel ── */}
        {showClassification && <ClassificationSection />}

        {!selectedGroup && !adding && !showGovRoles && !showUiTranslations && !showDqDims && !showClassification && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="text-6xl">⚙️</div>
            <h2 className="text-xl font-semibold text-ink">Application Configuration</h2>
            <p className="text-muted text-sm max-w-md">
              Configure governance role names, lookup values, and other platform-wide settings.
              Select a section from the sidebar to get started.
            </p>
          </div>
        )}

        {/* ── Add new lookup (possibly new group) ─── */}
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

        {/* ── Lookups table for selected group ─── */}
        {selectedGroup && (
          <div className="max-w-3xl">
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
              <div className="grid grid-cols-[80px_1fr_2fr_60px_60px_80px] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
                <div>Code</div><div>Label</div><div>Description</div><div>Order</div><div>Active</div><div>Actions</div>
              </div>

              {lookups.map(l => (
                <div key={l.lookupId} className="border-b border-line-soft last:border-b-0">
                  {editingId === l.lookupId ? (
                    <div className="px-5 py-4 space-y-3 bg-blue-50/40">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Label</label>
                          <input className="input w-full" value={editForm.lookupLabel} onChange={e => setEditForm(f => ({ ...f, lookupLabel: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Sort Order</label>
                          <input type="number" className="input w-full" value={editForm.sortOrder} onChange={e => setEditForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Description</label>
                          <input className="input w-full" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={editForm.isActive} onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))} />
                          <label className="text-sm text-ink">Active</label>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => handleSaveEdit(l.lookupId)} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Save"}</button>
                        <button onClick={() => setEditingId(null)} className="btn btn-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className={`grid grid-cols-[80px_1fr_2fr_60px_60px_80px] gap-3 px-5 py-3.5 items-center text-sm hover:bg-canvas-soft ${!l.isActive ? "opacity-50" : ""}`}>
                      <div className="font-mono text-[11px] text-brand-deep font-semibold">{l.lookupCode}</div>
                      <div className="font-medium text-ink">
                        {l.lookupLabel}
                        {l.isSystem && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded">system</span>}
                      </div>
                      <div className="text-ink-soft text-[12px] line-clamp-1">{l.description ?? "—"}</div>
                      <div className="text-muted text-center">{l.sortOrder}</div>
                      <div className="text-center">{l.isActive ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-400">✗</span>}</div>
                      <div className="flex items-center gap-2">
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
  form, onChange,
}: {
  form: { lookupCode: string; lookupLabel: string; description: string; sortOrder: number; isActive: boolean };
  onChange: (f: typeof form) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Code *</label>
        <input className="input w-full font-mono" placeholder="MY_CODE" value={form.lookupCode} onChange={e => onChange({ ...form, lookupCode: e.target.value })} />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Label *</label>
        <input className="input w-full" placeholder="My Label" value={form.lookupLabel} onChange={e => onChange({ ...form, lookupLabel: e.target.value })} />
      </div>
      <div className="col-span-2">
        <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Description</label>
        <input className="input w-full" placeholder="Optional description" value={form.description} onChange={e => onChange({ ...form, description: e.target.value })} />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Sort Order</label>
        <input type="number" className="input w-full" value={form.sortOrder} onChange={e => onChange({ ...form, sortOrder: Number(e.target.value) })} />
      </div>
      <div className="flex items-center gap-2 pt-5">
        <input type="checkbox" checked={form.isActive} onChange={e => onChange({ ...form, isActive: e.target.checked })} />
        <label className="text-sm text-ink">Active</label>
      </div>
    </div>
  );
}
