"use client";

import { useState } from "react";
import type { Role } from "@/lib/types";

type Resource = { id: string; name: string };

type Props = {
  roles:       Role[];
  sources:     Resource[];
  schemas:     Resource[];
  tables:      Resource[];
  userId?:     string;
  teamId?:     number;
  onDone:      () => void;
  onClose:     () => void;
};

const RESOURCE_TYPES = [
  { value: "GLOBAL",      label: "Global (all assets)" },
  { value: "DATA_SOURCE", label: "Data Source" },
  { value: "SCHEMA",      label: "Schema" },
  { value: "TABLE",       label: "Table" },
];

export function AssignRoleModal({ roles, sources, schemas, tables, userId, teamId, onDone, onClose }: Props) {
  const [roleId,       setRoleId]       = useState<string>("");
  const [resType,      setResType]      = useState<string>("GLOBAL");
  const [resId,        setResId]        = useState<string>("");
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState("");

  const resourceList: Resource[] =
    resType === "DATA_SOURCE" ? sources :
    resType === "SCHEMA"      ? schemas :
    resType === "TABLE"       ? tables  : [];

  const resName = resourceList.find((r) => r.id === resId)?.name ?? "Global";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!roleId) { setErr("Select a role."); return; }
    if (resType !== "GLOBAL" && !resId) { setErr("Select a resource."); return; }
    setSaving(true); setErr("");
    const res = await fetch("/api/admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleId:       Number(roleId),
        userId:       userId ?? undefined,
        teamId:       teamId ?? undefined,
        resourceType: resType,
        resourceId:   resType === "GLOBAL" ? null : resId,
        resourceName: resType === "GLOBAL" ? "Global" : resName,
      }),
    });
    setSaving(false);
    if (!res.ok) { setErr("Failed to assign role."); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] border border-line">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-bold text-brand-deep">Assign Role</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {err && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-md">{err}</p>}

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Role *</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
            >
              <option value="">— select role —</option>
              {roles.map((r) => (
                <option key={r.roleId} value={r.roleId}>{r.roleName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Scope *</label>
            <select
              value={resType}
              onChange={(e) => { setResType(e.target.value); setResId(""); }}
              className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
            >
              {RESOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {resType !== "GLOBAL" && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">
                {resType === "DATA_SOURCE" ? "Data Source" : resType === "SCHEMA" ? "Schema" : "Table"} *
              </label>
              <select
                value={resId}
                onChange={(e) => setResId(e.target.value)}
                className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
              >
                <option value="">— select —</option>
                {resourceList.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Preview effective privileges */}
          {roleId && (() => {
            const r = roles.find((r) => String(r.roleId) === roleId);
            if (!r) return null;
            const privs = [
              r.isAdmin        && { label: "Admin",           color: "bg-purple-100 text-purple-700" },
              r.metadataRead   && { label: "Metadata Read",   color: "bg-blue-100 text-blue-700" },
              r.metadataWrite  && { label: "Metadata Write",  color: "bg-blue-100 text-blue-700" },
              r.metadataDelete && { label: "Metadata Delete", color: "bg-red-100 text-red-700" },
              r.dataRead       && { label: "Data Read",       color: "bg-emerald-100 text-emerald-700" },
            ].filter(Boolean) as { label: string; color: string }[];
            return (
              <div className="bg-canvas-soft rounded-md px-3 py-3">
                <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Effective privileges</div>
                <div className="flex flex-wrap gap-1.5">
                  {privs.map((p) => (
                    <span key={p.label} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.color}`}>{p.label}</span>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="flex justify-end gap-2 pt-2 border-t border-line-soft">
            <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
              {saving ? "Assigning…" : "Assign Role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
