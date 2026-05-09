"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/types";

type Props = { role?: Role; onClose?: () => void };

type Privs = {
  metadataRead: boolean; metadataWrite: boolean; metadataDelete: boolean;
  dataRead: boolean; isAdmin: boolean;
};

export function RoleForm({ role, onClose }: Props) {
  const router  = useRouter();
  const editing = !!role;
  const [name,  setName]  = useState(role?.roleName    ?? "");
  const [desc,  setDesc]  = useState(role?.description ?? "");
  const [privs, setPrivs] = useState<Privs>({
    metadataRead:   role?.metadataRead   ?? false,
    metadataWrite:  role?.metadataWrite  ?? false,
    metadataDelete: role?.metadataDelete ?? false,
    dataRead:       role?.dataRead       ?? false,
    isAdmin:        role?.isAdmin        ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const toggle = (k: keyof Privs) => setPrivs((p) => ({ ...p, [k]: !p[k] }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) { setErr("Role name is required."); return; }
    setSaving(true); setErr("");

    const body = { roleName: name, description: desc, ...privs };
    const url  = editing ? `/api/admin/roles/${role!.roleId}` : "/api/admin/roles";
    const res  = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { setErr("Failed to save role."); return; }
    if (!editing) {
      const { roleId } = await res.json();
      router.push(`/admin/roles/${roleId}`);
    } else {
      router.refresh();
      onClose?.();
    }
  }

  const PRIV_ROWS: { key: keyof Privs; label: string; sublabel: string; color: string }[] = [
    { key: "metadataRead",   label: "Metadata Read",   sublabel: "View descriptions, tags, classifications, lineage", color: "blue" },
    { key: "metadataWrite",  label: "Metadata Write",  sublabel: "Edit descriptions, tags, add glossary links, stewards", color: "blue" },
    { key: "metadataDelete", label: "Metadata Delete", sublabel: "Remove metadata records, deprecate assets", color: "red" },
    { key: "dataRead",       label: "Data Read",       sublabel: "Preview table rows (tables only)", color: "emerald" },
    { key: "isAdmin",        label: "Platform Admin",  sublabel: "Full access — create users, roles, manage all assets", color: "purple" },
  ];

  const colorClass: Record<string, string> = {
    blue:    "border-blue-300 bg-blue-50 text-blue-700",
    red:     "border-red-300  bg-red-50  text-red-700",
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-700",
    purple:  "border-purple-300 bg-purple-50 text-purple-700",
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {err && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-md">{err}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Role Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Senior Data Steward" className="input-field" />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Description</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="Short description of this role's purpose" className="input-field" />
        </div>
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-muted mb-3">Privileges</label>
        <div className="space-y-2">
          {PRIV_ROWS.map(({ key, label, sublabel, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={[
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all",
                privs[key]
                  ? colorClass[color]
                  : "border-line bg-canvas hover:border-brand-purple/40",
              ].join(" ")}
            >
              <span className={[
                "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                privs[key] ? "border-current bg-current" : "border-muted",
              ].join(" ")}>
                {privs[key] && (
                  <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{label}</div>
                <div className="text-[11px] opacity-70">{sublabel}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-line-soft">
        {onClose && <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>}
        <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
          {saving ? "Saving…" : editing ? "Save Changes" : "Create Role"}
        </button>
      </div>
    </form>
  );
}
