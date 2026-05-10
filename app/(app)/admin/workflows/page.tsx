"use client";

import { useState, useEffect, useCallback } from "react";
import type { WorkflowDefinition } from "@/lib/queries/workflow";

const ALL_TYPES = [
  { code: "FIX_DATA_ISSUE",    label: "Fix Data Issue" },
  { code: "UPDATE_DEFINITION", label: "Update Definition" },
  { code: "CERTIFY_ASSET",     label: "Certify Asset" },
  { code: "GRANT_ACCESS",      label: "Grant Access" },
  { code: "REMOVE_ACCESS",     label: "Remove Access" },
  { code: "OTHER",             label: "Other" },
];

const ROLE_OPTIONS = [
  { value: "STEWARD",       label: "Data Steward" },
  { value: "OWNER",         label: "Asset Owner" },
  { value: "OFFICER",       label: "Data Officer" },
  { value: "ADMIN",         label: "Administrator" },
  { value: "REQUESTER",     label: "Request Raiser" },
  { value: "SPECIFIC_USER", label: "Specific User" },
];

const ROLE_COLOR: Record<string, string> = {
  STEWARD:       "bg-blue-50 text-blue-700",
  OWNER:         "bg-purple-50 text-purple-700",
  OFFICER:       "bg-amber-50 text-amber-700",
  ADMIN:         "bg-red-50 text-red-700",
  REQUESTER:     "bg-emerald-50 text-emerald-700",
  SPECIFIC_USER: "bg-gray-50 text-gray-600",
};

const TYPE_COLOR: Record<string, string> = {
  FIX_DATA_ISSUE:    "bg-red-50 text-red-700 border-red-200",
  UPDATE_DEFINITION: "bg-blue-50 text-blue-700 border-blue-200",
  CERTIFY_ASSET:     "bg-amber-50 text-amber-700 border-amber-200",
  GRANT_ACCESS:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  REMOVE_ACCESS:     "bg-orange-50 text-orange-700 border-orange-200",
  OTHER:             "bg-gray-50 text-gray-600 border-gray-200",
};

export default function WorkflowsAdminPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selected,  setSelected]  = useState<WorkflowDefinition | null>(null);
  const [loading,   setLoading]   = useState(true);

  // Stage form
  const [newStage, setNewStage] = useState({ stageName: "", description: "", assigneeRole: "STEWARD", assigneeUserId: "", slaHours: "", isFinal: false });
  const [addingStage, setAddingStage] = useState(false);
  const [showStageForm, setShowStageForm] = useState(false);

  // New workflow form
  const [showNewWf, setShowNewWf] = useState(false);
  const [newWf, setNewWf] = useState({ workflowName: "", description: "" });
  const [savingWf, setSavingWf] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/workflows");
    if (r.ok) {
      const data: WorkflowDefinition[] = await r.json();
      setWorkflows(data);
      // refresh selected if it was open
      setSelected((prev) => prev ? data.find((w) => w.workflowId === prev.workflowId) ?? null : null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function assignType(code: string, wfId: number | null) {
    await fetch("/api/admin/workflows/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestTypeCode: code, workflowId: wfId }),
    });
    load();
  }

  async function addStage() {
    if (!selected || !newStage.stageName.trim()) return;
    setAddingStage(true);
    await fetch(`/api/admin/workflows/${selected.workflowId}/stages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stageName:      newStage.stageName.trim(),
        description:    newStage.description.trim() || null,
        assigneeRole:   newStage.assigneeRole,
        assigneeUserId: newStage.assigneeUserId.trim() || null,
        slaHours:       newStage.slaHours ? Number(newStage.slaHours) : null,
        isFinal:        newStage.isFinal,
      }),
    });
    setNewStage({ stageName: "", description: "", assigneeRole: "STEWARD", assigneeUserId: "", slaHours: "", isFinal: false });
    setShowStageForm(false);
    setAddingStage(false);
    load();
  }

  async function deleteStage(stageId: number) {
    if (!selected) return;
    if (!confirm("Delete this stage?")) return;
    await fetch(`/api/admin/workflows/${selected.workflowId}/stages/${stageId}`, { method: "DELETE" });
    load();
  }

  async function toggleFinal(stageId: number, current: boolean) {
    if (!selected) return;
    await fetch(`/api/admin/workflows/${selected.workflowId}/stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFinal: !current }),
    });
    load();
  }

  async function createWorkflow() {
    if (!newWf.workflowName.trim()) return;
    setSavingWf(true);
    await fetch("/api/admin/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newWf),
    });
    setNewWf({ workflowName: "", description: "" });
    setShowNewWf(false);
    setSavingWf(false);
    load();
  }

  async function deleteWorkflow(wfId: number) {
    if (!confirm("Delete this workflow and all its stages?")) return;
    await fetch(`/api/admin/workflows/${wfId}`, { method: "DELETE" });
    if (selected?.workflowId === wfId) setSelected(null);
    load();
  }

  // Build mapping: request type → workflow name
  const typeToWf: Record<string, { workflowId: number; workflowName: string } | null> = {};
  for (const t of ALL_TYPES) typeToWf[t.code] = null;
  for (const wf of workflows) for (const t of wf.assignedTypes) typeToWf[t] = { workflowId: wf.workflowId, workflowName: wf.workflowName };

  return (
    <div className="flex h-[calc(100vh-120px)] overflow-hidden">
      {/* Left sidebar — workflow list */}
      <aside className="w-72 border-r border-line bg-white flex flex-col shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-bold text-sm text-brand-deep">Workflows</h2>
          <button
            onClick={() => setShowNewWf(true)}
            className="text-[11px] font-semibold text-brand-purple hover:underline"
          >
            + New
          </button>
        </div>

        {/* New workflow form */}
        {showNewWf && (
          <div className="px-4 py-3 border-b border-line bg-canvas space-y-2">
            <input
              value={newWf.workflowName}
              onChange={(e) => setNewWf((p) => ({ ...p, workflowName: e.target.value }))}
              placeholder="Workflow name *"
              className="w-full text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple"
            />
            <input
              value={newWf.description}
              onChange={(e) => setNewWf((p) => ({ ...p, description: e.target.value }))}
              placeholder="Description"
              className="w-full text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple"
            />
            <div className="flex gap-2">
              <button onClick={createWorkflow} disabled={savingWf} className="btn btn-primary btn-sm flex-1">{savingWf ? "…" : "Create"}</button>
              <button onClick={() => setShowNewWf(false)} className="btn btn-sm flex-1">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto nice-scroll">
          {loading && <div className="py-8 text-center text-muted text-sm">Loading…</div>}
          {!loading && workflows.map((wf) => (
            <button
              key={wf.workflowId}
              onClick={() => setSelected(wf)}
              className={`w-full text-left px-5 py-3.5 border-b border-line-soft transition-colors ${selected?.workflowId === wf.workflowId ? "bg-brand-purple/5 border-l-2 border-l-brand-purple" : "hover:bg-canvas"}`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[13px] font-semibold text-brand-deep">{wf.workflowName}</span>
                <span className="text-[10px] text-muted">{wf.stages.length} stages</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {wf.assignedTypes.map((t) => (
                  <span key={t} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${TYPE_COLOR[t] ?? "bg-gray-50"}`}>
                    {ALL_TYPES.find((x) => x.code === t)?.label ?? t}
                  </span>
                ))}
                {wf.assignedTypes.length === 0 && <span className="text-[10px] text-muted italic">No request types</span>}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Right — workflow detail */}
      <div className="flex-1 overflow-y-auto nice-scroll bg-canvas">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-muted gap-2">
            <svg viewBox="0 0 24 24" className="w-10 h-10 opacity-25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <span className="text-sm">Select a workflow to view and edit</span>
          </div>
        ) : (
          <div className="p-7 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-extrabold text-brand-deep">{selected.workflowName}</h1>
                {selected.description && <p className="text-sm text-muted mt-1">{selected.description}</p>}
              </div>
              <button
                onClick={() => deleteWorkflow(selected.workflowId)}
                className="text-[12px] text-red-500 hover:underline shrink-0 ml-4"
              >
                Delete workflow
              </button>
            </div>

            {/* Request type assignments */}
            <div className="card p-5 mb-6">
              <h3 className="text-[11px] uppercase tracking-wider text-muted font-bold mb-3">Assigned Request Types</h3>
              <div className="space-y-2">
                {ALL_TYPES.map((t) => {
                  const assigned = typeToWf[t.code];
                  const isThisWf = assigned?.workflowId === selected.workflowId;
                  return (
                    <div key={t.code} className="flex items-center justify-between">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${TYPE_COLOR[t.code] ?? ""}`}>{t.label}</span>
                      <div className="flex items-center gap-2">
                        {assigned && !isThisWf && (
                          <span className="text-[10px] text-muted">→ {assigned.workflowName}</span>
                        )}
                        <button
                          onClick={() => assignType(t.code, isThisWf ? null : selected.workflowId)}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                            isThisWf
                              ? "bg-brand-purple text-white"
                              : "bg-canvas border border-line text-muted hover:border-brand-purple hover:text-brand-purple"
                          }`}
                        >
                          {isThisWf ? "✓ Assigned" : "Assign"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stages */}
            <div className="card overflow-hidden mb-4">
              <div className="flex items-center justify-between px-5 py-3 border-b border-line">
                <h3 className="text-[11px] uppercase tracking-wider text-muted font-bold">Stages</h3>
                <button
                  onClick={() => setShowStageForm((v) => !v)}
                  className="text-[11px] font-semibold text-brand-purple hover:underline"
                >
                  {showStageForm ? "Cancel" : "+ Add Stage"}
                </button>
              </div>

              {selected.stages.length === 0 && !showStageForm && (
                <div className="px-5 py-6 text-center text-muted text-sm">No stages yet — add the first one.</div>
              )}

              {selected.stages.map((s, i) => (
                <div key={s.stageId} className={`flex items-start gap-3 px-5 py-3.5 ${i > 0 ? "border-t border-line-soft" : ""}`}>
                  <div className="w-6 h-6 rounded-full bg-brand-purple/10 text-brand-purple text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {s.stageOrder}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] font-semibold text-brand-deep">{s.stageName}</span>
                      {s.isFinal && <span className="text-[9px] font-bold text-white bg-brand-purple px-1.5 py-0.5 rounded-full">FINAL</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_COLOR[s.assigneeRole] ?? ""}`}>
                        {ROLE_OPTIONS.find((r) => r.value === s.assigneeRole)?.label ?? s.assigneeRole}
                      </span>
                      {s.slaValue && <span className="text-[10px] text-muted">SLA: {s.slaValue}d</span>}
                      {s.description && <span className="text-[10px] text-muted">{s.description}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleFinal(s.stageId, s.isFinal)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${s.isFinal ? "border-brand-purple text-brand-purple" : "border-line text-muted hover:border-brand-purple hover:text-brand-purple"}`}
                    >
                      {s.isFinal ? "Unmark final" : "Mark final"}
                    </button>
                    <button
                      onClick={() => deleteStage(s.stageId)}
                      className="text-[10px] text-red-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              {/* Add stage form */}
              {showStageForm && (
                <div className="border-t border-line px-5 py-4 bg-canvas space-y-3">
                  <h4 className="text-[11px] font-bold text-muted uppercase tracking-wider">New Stage</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={newStage.stageName}
                      onChange={(e) => setNewStage((p) => ({ ...p, stageName: e.target.value }))}
                      placeholder="Stage name *"
                      className="col-span-2 text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple"
                    />
                    <input
                      value={newStage.description}
                      onChange={(e) => setNewStage((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Description"
                      className="col-span-2 text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple"
                    />
                    <div>
                      <label className="text-[10px] text-muted block mb-1">Assignee Role</label>
                      <select
                        value={newStage.assigneeRole}
                        onChange={(e) => setNewStage((p) => ({ ...p, assigneeRole: e.target.value }))}
                        className="w-full text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple"
                      >
                        {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted block mb-1">SLA (hours)</label>
                      <input
                        type="number"
                        value={newStage.slaHours}
                        onChange={(e) => setNewStage((p) => ({ ...p, slaHours: e.target.value }))}
                        placeholder="e.g. 48"
                        className="w-full text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple"
                      />
                    </div>
                    {newStage.assigneeRole === "SPECIFIC_USER" && (
                      <input
                        value={newStage.assigneeUserId}
                        onChange={(e) => setNewStage((p) => ({ ...p, assigneeUserId: e.target.value }))}
                        placeholder="User ID"
                        className="col-span-2 text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple"
                      />
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStage.isFinal}
                      onChange={(e) => setNewStage((p) => ({ ...p, isFinal: e.target.checked }))}
                      className="accent-brand-purple"
                    />
                    Mark as final stage (completes the workflow)
                  </label>
                  <div className="flex gap-2">
                    <button onClick={addStage} disabled={addingStage} className="btn btn-primary btn-sm">
                      {addingStage ? "Adding…" : "Add Stage"}
                    </button>
                    <button onClick={() => setShowStageForm(false)} className="btn btn-sm">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
