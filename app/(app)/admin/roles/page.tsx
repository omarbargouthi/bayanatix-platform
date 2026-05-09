"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/types";
import { RoleForm } from "@/components/admin/RoleForm";

function PrivDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
      on ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
    }`}>
      {on ? "✓" : "—"} {label}
    </span>
  );
}

export default function RolesPage() {
  const router = useRouter();
  const [roles,     setRoles]     = useState<Role[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/roles");
    setRoles(await r.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function deleteRole(id: number) {
    if (!confirm("Delete this role? All assignments will be removed.")) return;
    await fetch(`/api/admin/roles/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="px-8 py-7 pb-14">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        <Stat label="Total Roles" value={roles.length} />
        <Stat label="Admin Roles" value={roles.filter((r) => r.isAdmin).length}   color="purple" />
        <Stat label="User Assignments" value={roles.reduce((s, r) => s + r.userCount, 0)} color="blue" />
        <Stat label="Team Assignments" value={roles.reduce((s, r) => s + r.teamCount, 0)} color="green" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
          <h3 className="font-bold">Roles <span className="text-muted text-xs font-normal ml-2">{roles.length} defined</span></h3>
          <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">+ New Role</button>
        </div>

        <div className="grid grid-cols-[2fr_2fr_2fr_0.8fr_0.8fr_1fr] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
          <div>Role</div><div>Description</div><div>Privileges</div><div>Users</div><div>Teams</div><div>Actions</div>
        </div>

        {loading && <div className="py-10 text-center text-muted text-sm">Loading…</div>}

        {roles.map((r) => (
          <div key={r.roleId} className="grid grid-cols-[2fr_2fr_2fr_0.8fr_0.8fr_1fr] gap-3 px-5 py-4 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft">
            <div>
              <div className="font-semibold text-brand-deep flex items-center gap-1.5">
                {r.isAdmin && <span className="w-4 h-4 text-purple-600">🛡</span>}
                {r.roleName}
              </div>
            </div>
            <div className="text-ink-soft text-[13px] line-clamp-2">{r.description ?? "—"}</div>
            <div className="flex flex-wrap gap-1">
              {r.isAdmin && <PrivDot on label="Admin" />}
              {!r.isAdmin && <PrivDot on={r.metadataRead}   label="Meta R" />}
              {!r.isAdmin && <PrivDot on={r.metadataWrite}  label="Meta W" />}
              {!r.isAdmin && <PrivDot on={r.metadataDelete} label="Meta Del" />}
              {!r.isAdmin && <PrivDot on={r.dataRead}       label="Data R" />}
            </div>
            <div className="font-semibold text-brand-deep">{r.userCount || "—"}</div>
            <div className="font-semibold text-brand-deep">{r.teamCount || "—"}</div>
            <div className="flex items-center gap-2">
              <Link href={`/admin/roles/${r.roleId}`} className="btn btn-sm text-xs">Edit</Link>
              <button onClick={() => deleteRole(r.roleId)} className="btn btn-sm text-xs text-red-600 hover:bg-red-50">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl w-[600px] border border-line">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="font-bold text-brand-deep">New Role</h2>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5">
              <RoleForm onClose={() => { setShowForm(false); load(); }} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, color = "blue" }: { label: string; value: number; color?: "blue"|"green"|"purple" }) {
  const ring = { blue: "border-l-blue-400 bg-blue-50/60", green: "border-l-emerald-400 bg-emerald-50/60", purple: "border-l-brand-purple bg-brand-purple/5" }[color];
  const text = { blue: "text-blue-600", green: "text-emerald-600", purple: "text-brand-purple" }[color];
  return (
    <div className={`card border-l-4 ${ring} px-5 py-4`}>
      <div className={`text-2xl font-extrabold ${text}`}>{value}</div>
      <div className="text-[11px] text-muted mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}
