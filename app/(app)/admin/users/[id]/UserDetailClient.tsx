"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AdminUser, Role, RoleAssignment } from "@/lib/types";
import { AssignRoleModal } from "@/components/admin/AssignRoleModal";

type Resource = { id: string; name: string };

const PRIV_PILL = (on: boolean, label: string, color: string) =>
  on ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${color}`}>{label}</span> : null;

const SCOPE_BADGE: Record<string, string> = {
  GLOBAL:      "bg-purple-50 text-purple-700 border-purple-200",
  DATA_SOURCE: "bg-blue-50   text-blue-700   border-blue-200",
  SCHEMA:      "bg-sky-50    text-sky-700    border-sky-200",
  TABLE:       "bg-teal-50   text-teal-700   border-teal-200",
};

export function UserDetailClient({
  user, assignments, roles, sources, schemas, tables,
}: {
  user:        AdminUser;
  assignments: RoleAssignment[];
  roles:       Role[];
  sources:     Resource[];
  schemas:     Resource[];
  tables:      Resource[];
}) {
  const router = useRouter();
  const [showAssign,  setShowAssign]  = useState(false);
  const [editName,    setEditName]    = useState(user.fullName);
  const [editRole,    setEditRole]    = useState(user.systemRole);
  const [editEmail,   setEditEmail]   = useState(user.email);
  const [savingInfo,  setSavingInfo]  = useState(false);

  async function saveInfo() {
    setSavingInfo(true);
    await fetch(`/api/admin/users/${user.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: editName, email: editEmail, systemRole: editRole }),
    });
    setSavingInfo(false);
    router.refresh();
  }

  async function removeAssignment(id: number) {
    await fetch("/api/admin/assignments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: id }),
    });
    router.refresh();
  }

  const initials = user.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2);

  return (
    <main className="px-8 py-7 pb-14">
      <div className="grid grid-cols-[340px_1fr] gap-6">

        {/* Left: user card */}
        <aside className="space-y-5">
          <div className="card p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-brand-purple/15 text-brand-purple text-xl font-extrabold grid place-items-center mx-auto mb-3">
              {initials}
            </div>
            <div className="font-bold text-lg text-brand-deep">{user.fullName}</div>
            <div className="text-sm text-muted">{user.userId}</div>
            <div className={`mt-2 inline-block text-[11px] font-semibold px-3 py-0.5 rounded-full ${user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
              {user.isActive ? "Active" : "Inactive"}
            </div>
          </div>

          {/* Edit info */}
          <div className="card p-5">
            <h3 className="font-bold text-sm mb-4">Profile</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">Full Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">Email</label>
                <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">System Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="input-field text-sm">
                  {["ADMIN","STEWARD","OFFICER","VIEWER"].map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <button onClick={saveInfo} disabled={savingInfo} className="btn btn-primary btn-sm w-full">
                {savingInfo ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>

          <div className="card px-5 py-4 text-[12px] space-y-1.5 text-muted">
            <div className="flex justify-between"><span>Member since</span><span className="text-ink">{new Date(user.createdAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</span></div>
            <div className="flex justify-between"><span>Teams</span><span className="text-ink font-semibold">{user.teamCount}</span></div>
            <div className="flex justify-between"><span>Role assignments</span><span className="text-ink font-semibold">{assignments.length}</span></div>
          </div>
        </aside>

        {/* Right: role assignments */}
        <section>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
              <h3 className="font-bold">
                Role Assignments
                <span className="text-muted text-xs font-normal ml-2">{assignments.length} assigned</span>
              </h3>
              <button onClick={() => setShowAssign(true)} className="btn btn-primary btn-sm">+ Assign Role</button>
            </div>

            {assignments.length === 0 && (
              <div className="py-14 text-center text-muted text-sm">
                No roles assigned yet. Click <strong>"Assign Role"</strong> to grant access.
              </div>
            )}

            {assignments.map((a) => (
              <div key={a.assignmentId} className="flex items-center gap-4 px-5 py-4 border-b border-line-soft last:border-b-0 hover:bg-canvas-soft">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-brand-deep text-sm">{a.roleName}</span>
                    {PRIV_PILL(a.isAdmin,        "Admin",     "bg-purple-100 text-purple-700")}
                    {PRIV_PILL(a.metadataRead,   "Meta R",    "bg-blue-100 text-blue-700")}
                    {PRIV_PILL(a.metadataWrite,  "Meta W",    "bg-blue-100 text-blue-700")}
                    {PRIV_PILL(a.metadataDelete, "Meta Del",  "bg-red-100 text-red-700")}
                    {PRIV_PILL(a.dataRead,       "Data R",    "bg-emerald-100 text-emerald-700")}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${SCOPE_BADGE[a.resourceType] ?? ""}`}>
                      {a.resourceType.replace("_", " ")}
                    </span>
                    {a.resourceName && a.resourceName !== "Global" && (
                      <span className="text-[12px] text-ink-soft">{a.resourceName}</span>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-muted">{new Date(a.createdAt).toLocaleDateString("en-GB")}</div>
                <button
                  onClick={() => removeAssignment(a.assignmentId)}
                  className="text-muted hover:text-red-600 transition-colors"
                  title="Remove assignment"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {showAssign && (
        <AssignRoleModal
          roles={roles}
          sources={sources}
          schemas={schemas}
          tables={tables}
          userId={user.userId}
          onDone={() => { setShowAssign(false); router.refresh(); }}
          onClose={() => setShowAssign(false)}
        />
      )}
    </main>
  );
}
