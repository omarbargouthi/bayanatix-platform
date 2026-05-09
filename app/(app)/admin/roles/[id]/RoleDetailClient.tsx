"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Role, RoleAssignment } from "@/lib/types";
import { RoleForm } from "@/components/admin/RoleForm";

const SCOPE_BADGE: Record<string, string> = {
  GLOBAL:      "bg-purple-50 text-purple-700 border-purple-200",
  DATA_SOURCE: "bg-blue-50   text-blue-700   border-blue-200",
  SCHEMA:      "bg-sky-50    text-sky-700    border-sky-200",
  TABLE:       "bg-teal-50   text-teal-700   border-teal-200",
};

const PRIV_ROWS = [
  { key: "metadataRead"   as const, label: "Metadata Read",   sublabel: "View all catalog metadata",          color: "blue" },
  { key: "metadataWrite"  as const, label: "Metadata Write",  sublabel: "Edit descriptions, tags, stewards",  color: "blue" },
  { key: "metadataDelete" as const, label: "Metadata Delete", sublabel: "Remove metadata and deprecate assets",color: "red" },
  { key: "dataRead"       as const, label: "Data Read",       sublabel: "Preview table row data",              color: "emerald" },
  { key: "isAdmin"        as const, label: "Platform Admin",  sublabel: "Full platform administration",        color: "purple" },
];

const PRIV_COLORS: Record<string, { on: string; off: string }> = {
  blue:    { on: "bg-blue-100 text-blue-700 border-blue-300",       off: "bg-canvas border-line text-muted" },
  red:     { on: "bg-red-100 text-red-700 border-red-300",         off: "bg-canvas border-line text-muted" },
  emerald: { on: "bg-emerald-100 text-emerald-700 border-emerald-300", off: "bg-canvas border-line text-muted" },
  purple:  { on: "bg-purple-100 text-purple-700 border-purple-300", off: "bg-canvas border-line text-muted" },
};

export function RoleDetailClient({ role, assignments }: { role: Role; assignments: RoleAssignment[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const userAssignments = assignments.filter((a) => a.userId !== null);
  const teamAssignments = assignments.filter((a) => a.teamId !== null);

  return (
    <main className="px-8 py-7 pb-14">
      <div className="grid grid-cols-[360px_1fr] gap-6">

        {/* Left: role card + privileges */}
        <aside className="space-y-5">
          <div className="card p-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted mb-1">Role</div>
                <h2 className="text-xl font-extrabold text-brand-deep">{role.roleName}</h2>
                {role.isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 mt-1">
                    🛡 Platform Admin
                  </span>
                )}
              </div>
              <button onClick={() => setEditing(true)} className="btn btn-sm">Edit</button>
            </div>
            <p className="text-sm text-ink-soft">{role.description ?? "No description."}</p>
            <div className="flex gap-5 mt-4 pt-4 border-t border-line-soft text-sm">
              <div><div className="text-2xl font-extrabold text-brand-deep">{role.userCount}</div><div className="text-[11px] text-muted">Users</div></div>
              <div><div className="text-2xl font-extrabold text-brand-deep">{role.teamCount}</div><div className="text-[11px] text-muted">Teams</div></div>
            </div>
          </div>

          {/* Privilege matrix */}
          <div className="card p-5">
            <h3 className="font-bold text-sm mb-3">Privileges</h3>
            <div className="space-y-2">
              {PRIV_ROWS.map(({ key, label, sublabel, color }) => {
                const on = role[key] as boolean;
                const c  = PRIV_COLORS[color];
                return (
                  <div key={key} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${on ? c.on : c.off}`}>
                    <span className={`text-sm font-bold ${on ? "" : "opacity-30"}`}>{on ? "✓" : "✗"}</span>
                    <div>
                      <div className="text-[12px] font-semibold">{label}</div>
                      <div className="text-[10px] opacity-70">{sublabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right: assignments */}
        <section className="space-y-5">
          {/* User assignments */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line-soft">
              <h3 className="font-bold text-sm">Users with this Role <span className="text-muted text-xs font-normal ml-2">{userAssignments.length}</span></h3>
            </div>
            {userAssignments.length === 0
              ? <div className="py-8 text-center text-muted text-sm">No users assigned.</div>
              : userAssignments.map((a) => (
                <div key={a.assignmentId} className="flex items-center gap-3 px-5 py-3 border-b border-line-soft last:border-b-0 hover:bg-canvas-soft">
                  <span className="w-7 h-7 rounded-full bg-brand-purple/15 text-brand-purple text-[11px] font-bold grid place-items-center shrink-0">
                    {(a.userFullName ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </span>
                  <Link href={`/admin/users/${a.userId}`} className="flex-1 font-medium text-sm hover:text-brand-purple">{a.userFullName}</Link>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${SCOPE_BADGE[a.resourceType]}`}>
                    {a.resourceType.replace("_", " ")}
                  </span>
                  {a.resourceName && a.resourceName !== "Global" && (
                    <span className="text-[12px] text-muted">{a.resourceName}</span>
                  )}
                </div>
              ))
            }
          </div>

          {/* Team assignments */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line-soft">
              <h3 className="font-bold text-sm">Teams with this Role <span className="text-muted text-xs font-normal ml-2">{teamAssignments.length}</span></h3>
            </div>
            {teamAssignments.length === 0
              ? <div className="py-8 text-center text-muted text-sm">No teams assigned.</div>
              : teamAssignments.map((a) => (
                <div key={a.assignmentId} className="flex items-center gap-3 px-5 py-3 border-b border-line-soft last:border-b-0 hover:bg-canvas-soft">
                  <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 text-[11px] font-bold grid place-items-center shrink-0">
                    {(a.teamName ?? "?").slice(0, 2).toUpperCase()}
                  </span>
                  <Link href={`/admin/teams/${a.teamId}`} className="flex-1 font-medium text-sm hover:text-brand-purple">{a.teamName}</Link>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${SCOPE_BADGE[a.resourceType]}`}>
                    {a.resourceType.replace("_", " ")}
                  </span>
                  {a.resourceName && a.resourceName !== "Global" && (
                    <span className="text-[12px] text-muted">{a.resourceName}</span>
                  )}
                </div>
              ))
            }
          </div>
        </section>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl w-[600px] border border-line">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="font-bold text-brand-deep">Edit Role</h2>
              <button onClick={() => setEditing(false)} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5">
              <RoleForm role={role} onClose={() => { setEditing(false); router.refresh(); }} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
