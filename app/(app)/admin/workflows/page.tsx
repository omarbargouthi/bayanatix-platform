"use client";

import { useState, useEffect, useCallback } from "react";
import type { WorkflowDefinition } from "@/lib/queries/workflow";
import type { Role, Team, AdminUser } from "@/lib/types";

const ALL_TYPES = [
  { code: "FIX_DATA_ISSUE",       label: "Fix Data Issue" },
  { code: "UPDATE_DEFINITION",    label: "Update Definition" },
  { code: "CERTIFY_ASSET",        label: "Certify Asset" },
  { code: "GRANT_ACCESS",         label: "Grant Access" },
  { code: "REMOVE_ACCESS",        label: "Remove Access" },
  { code: "OTHER",                label: "Other" },
  { code: "CLASSIFY_ASSET",       label: "Classify Asset" },
  { code: "COMPLIANCE_REVIEW",    label: "Compliance Review" },
  { code: "PUBLISH_OPEN_DATA",    label: "Publish Open Data" },
  { code: "PUBLISH_OPEN_DATA_PI", label: "Publish Open Data (PI)" },
];

const ASSIGNEE_TYPE_OPTIONS = [
  { value: "ROLE",      label: "A Role" },
  { value: "TEAM",      label: "A Team" },
  { value: "USER",      label: "A Specific User" },
  { value: "REQUESTER", label: "Whoever Raised the Request" },
];

const ASSIGNEE_TYPE_COLOR: Record<string, string> = {
  ROLE:      "bg-blue-50 text-blue-700",
  TEAM:      "bg-purple-50 text-purple-700",
  USER:      "bg-gray-50 text-gray-600",
  REQUESTER: "bg-emerald-50 text-emerald-700",
};

const TYPE_COLOR: Record<string, string> = {
  FIX_DATA_ISSUE:       "bg-red-50 text-red-700 border-red-200",
  UPDATE_DEFINITION:    "bg-blue-50 text-blue-700 border-blue-200",
  CERTIFY_ASSET:        "bg-amber-50 text-amber-700 border-amber-200",
  GRANT_ACCESS:         "bg-emerald-50 text-emerald-700 border-emerald-200",
  REMOVE_ACCESS:        "bg-orange-50 text-orange-700 border-orange-200",
  OTHER:                "bg-gray-50 text-gray-600 border-gray-200",
  CLASSIFY_ASSET:       "bg-indigo-50 text-indigo-700 border-indigo-200",
  COMPLIANCE_REVIEW:    "bg-teal-50 text-teal-700 border-teal-200",
  PUBLISH_OPEN_DATA:    "bg-cyan-50 text-cyan-700 border-cyan-200",
  PUBLISH_OPEN_DATA_PI: "bg-pink-50 text-pink-700 border-pink-200",
};

const STATUS_COLOR: Record<string, string> = {
  Draft:    "bg-amber-100 text-amber-700",
  Active:   "bg-emerald-100 text-emerald-700",
  Deactive: "bg-gray-200 text-gray-600",
};

export default function WorkflowsAdminPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selected,  setSelected]  = useState<WorkflowDefinition | null>(null);
  const [loading,   setLoading]   = useState(true);

  // Assignee pickers — real Roles/Teams/Users from User Management
  const [roles, setRoles] = useState<Role[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  // Stage form
  const [newStage, setNewStage] = useState({
    stageName: "", description: "",
    assigneeType: "ROLE", assigneeRoleId: "", assigneeTeamId: "", assigneeUserId: "",
    slaHours: "", isFinal: false,
  });
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

  useEffect(() => {
    fetch("/api/admin/roles").then((r) => r.ok ? r.json() : []).then(setRoles);
    fetch("/api/admin/teams").then((r) => r.ok ? r.json() : []).then(setTeams);
    fetch("/api/admin/users").then((r) => r.ok ? r.json() : []).then(setUsers);
  }, []);

  async function assignType(code: string, wfId: number | null) {
    const res = await fetch("/api/admin/workflows/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestTypeCode: code, workflowId: wfId }),
    });
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); alert(error ?? "Assign failed"); return; }
    load();
  }

  async function setStatus(wfId: number, statusCode: string) {
    const res = await fetch(`/api/admin/workflows/${wfId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusCode }),
    });
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); alert(error ?? "Status change failed"); return; }
    load();
  }

  async function addStage() {
    if (!selected || !newStage.stageName.trim()) return;
    if (newStage.assigneeType === "ROLE" && !newStage.assigneeRoleId) return;
    if (newStage.assigneeType === "TEAM" && !newStage.assigneeTeamId) return;
    if (newStage.assigneeType === "USER" && !newStage.assigneeUserId) return;
    setAddingStage(true);
    await fetch(`/api/admin/workflows/${selected.workflowId}/stages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stageName:      newStage.stageName.trim(),
        description:    newStage.description.trim() || null,
        assigneeType:   newStage.assigneeType,
        assigneeRoleId: newStage.assigneeRoleId ? Number(newStage.assigneeRoleId) : null,
        assigneeTeamId: newStage.assigneeTeamId ? Number(newStage.assigneeTeamId) : null,
        assigneeUserId: newStage.assigneeUserId || null,
        slaHours:       newStage.slaHours ? Number(newStage.slaHours) : null,
        isFinal:        newStage.isFinal,
      }),
    });
    setNewStage({ stageName: "", description: "", assigneeType: "ROLE", assigneeRoleId: "", assigneeTeamId: "", assigneeUserId: "", slaHours: "", isFinal: false });
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
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[wf.statusCode] ?? ""}`}>{wf.statusCode}</span>
                  <span className="text-[10px] text-muted">{wf.stages.length} stages</span>
                </div>
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
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <select
                  value={selected.statusCode}
                  onChange={(e) => setStatus(selected.workflowId, e.target.value)}
                  className={`text-[11px] font-bold rounded-full px-2.5 py-1 border-0 ${STATUS_COLOR[selected.statusCode] ?? ""}`}
                >
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Deactive">Deactive</option>
                </select>
                <button
                  onClick={() => deleteWorkflow(selected.workflowId)}
                  className="text-[12px] text-red-500 hover:underline"
                >
                  Delete workflow
                </button>
              </div>
            </div>

            {selected.statusCode === "Deactive" && (
              <div className="mb-6 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ This workflow is <strong>Deactive</strong> — requests routed here are approved immediately with no review, no stage history, and no reviewer notifications.
              </div>
            )}

            {/* Request type assignments */}
            <div className="card p-5 mb-6">
              <h3 className="text-[11px] uppercase tracking-wider text-muted font-bold mb-3">Assigned Request Types</h3>
              {selected.statusCode === "Draft" && (
                <p className="text-[11px] text-muted italic mb-3">Activate this workflow before assigning it to a request type.</p>
              )}
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
                          disabled={selected.statusCode === "Draft" && !isThisWf}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ASSIGNEE_TYPE_COLOR[s.assigneeType] ?? ""}`}>
                        {s.assigneeLabel ?? s.assigneeType}
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
                      <label className="text-[10px] text-muted block mb-1">Assign To</label>
                      <select
                        value={newStage.assigneeType}
                        onChange={(e) => setNewStage((p) => ({ ...p, assigneeType: e.target.value, assigneeRoleId: "", assigneeTeamId: "", assigneeUserId: "" }))}
                        className="w-full text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple"
                      >
                        {ASSIGNEE_TYPE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
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
                    {newStage.assigneeType === "ROLE" && (
                      <div className="col-span-2">
                        <label className="text-[10px] text-muted block mb-1">Role *</label>
                        <select
                          value={newStage.assigneeRoleId}
                          onChange={(e) => setNewStage((p) => ({ ...p, assigneeRoleId: e.target.value }))}
                          className="w-full text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple"
                        >
                          <option value="">— select role —</option>
                          {roles.map((r) => <option key={r.roleId} value={r.roleId}>{r.roleName}</option>)}
                        </select>
                      </div>
                    )}
                    {newStage.assigneeType === "TEAM" && (
                      <div className="col-span-2">
                        <label className="text-[10px] text-muted block mb-1">Team *</label>
                        <select
                          value={newStage.assigneeTeamId}
                          onChange={(e) => setNewStage((p) => ({ ...p, assigneeTeamId: e.target.value }))}
                          className="w-full text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple"
                        >
                          <option value="">— select team —</option>
                          {teams.map((t) => <option key={t.teamId} value={t.teamId}>{t.teamName}</option>)}
                        </select>
                      </div>
                    )}
                    {newStage.assigneeType === "USER" && (
                      <div className="col-span-2">
                        <label className="text-[10px] text-muted block mb-1">User *</label>
                        <select
                          value={newStage.assigneeUserId}
                          onChange={(e) => setNewStage((p) => ({ ...p, assigneeUserId: e.target.value }))}
                          className="w-full text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple"
                        >
                          <option value="">— select user —</option>
                          {users.map((u) => <option key={u.userId} value={u.userId}>{u.fullName}</option>)}
                        </select>
                      </div>
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
