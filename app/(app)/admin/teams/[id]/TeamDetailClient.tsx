"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Team, TeamMember, RoleAssignment, Role, AdminUser, SourceOption, SchemaOption, TableOption } from "@/lib/types";
import { AssignRoleModal } from "@/components/admin/AssignRoleModal";
import { TeamForm } from "@/components/admin/TeamForm";

const SCOPE_BADGE: Record<string, string> = {
  GLOBAL:      "bg-purple-50 text-purple-700 border-purple-200",
  DATA_SOURCE: "bg-blue-50   text-blue-700   border-blue-200",
  SCHEMA:      "bg-sky-50    text-sky-700    border-sky-200",
  TABLE:       "bg-teal-50   text-teal-700   border-teal-200",
};

const ROLE_BADGE: Record<string, string> = {
  ADMIN:   "bg-purple-100 text-purple-700",
  STEWARD: "bg-blue-100   text-blue-700",
  OFFICER: "bg-amber-100  text-amber-700",
  VIEWER:  "bg-gray-100   text-gray-600",
};

export function TeamDetailClient({
  team, members, assignments, roles, nonMembers, sources, schemas, tables,
}: {
  team:        Team;
  members:     TeamMember[];
  assignments: RoleAssignment[];
  roles:       Role[];
  nonMembers:  AdminUser[];
  sources:     SourceOption[];
  schemas:     SchemaOption[];
  tables:      TableOption[];
}) {
  const router = useRouter();
  const [showAssign,  setShowAssign]  = useState(false);
  const [showEdit,    setShowEdit]    = useState(false);
  const [addUserId,   setAddUserId]   = useState("");
  const [addingUser,  setAddingUser]  = useState(false);

  async function addMember() {
    if (!addUserId) return;
    setAddingUser(true);
    await fetch(`/api/admin/teams/${team.teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: addUserId }),
    });
    setAddingUser(false);
    setAddUserId("");
    router.refresh();
  }

  async function removeMember(userId: string) {
    await fetch(`/api/admin/teams/${team.teamId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
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

  return (
    <main className="px-8 py-7 pb-14">
      {/* Hero */}
      <div className="rounded-xl border border-line bg-gradient-to-br from-[#f5f5ff] to-[#ecedf9] p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="w-14 h-14 rounded-xl bg-brand-purple/20 text-brand-purple text-xl font-extrabold grid place-items-center">
              {team.teamName.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h1 className="text-2xl font-extrabold text-brand-deep">{team.teamName}</h1>
              <p className="text-sm text-ink-soft mt-0.5">{team.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">{members.length} members · {assignments.length} role assignments</span>
            <button onClick={() => setShowEdit(true)} className="btn btn-sm">Edit</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-6">

        {/* Members */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
            <h3 className="font-bold text-sm">Members <span className="text-muted text-xs font-normal ml-1.5">{members.length}</span></h3>
          </div>

          {/* Add member */}
          {nonMembers.length > 0 && (
            <div className="flex items-center gap-2 px-5 py-3 border-b border-line-soft bg-canvas-soft">
              <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}
                className="flex-1 border border-line rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30">
                <option value="">Add user to team…</option>
                {nonMembers.map((u) => (
                  <option key={u.userId} value={u.userId}>{u.fullName} ({u.userId})</option>
                ))}
              </select>
              <button onClick={addMember} disabled={!addUserId || addingUser} className="btn btn-primary btn-sm text-xs">
                {addingUser ? "Adding…" : "Add"}
              </button>
            </div>
          )}

          {members.length === 0
            ? <div className="py-8 text-center text-muted text-sm">No members yet.</div>
            : members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 px-5 py-3 border-b border-line-soft last:border-b-0 hover:bg-canvas-soft">
                <span className="w-8 h-8 rounded-full bg-brand-purple/15 text-brand-purple text-[11px] font-bold grid place-items-center shrink-0">
                  {m.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
                <div className="flex-1 min-w-0">
                  <Link href={`/admin/users/${m.userId}`} className="font-medium text-sm hover:text-brand-purple">{m.fullName}</Link>
                  <div className="text-[11px] text-muted">{m.email}</div>
                </div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[m.systemRole] ?? "bg-gray-100 text-gray-600"}`}>
                  {m.systemRole}
                </span>
                <button onClick={() => removeMember(m.userId)} title="Remove"
                  className="text-muted hover:text-red-500 transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))
          }
        </div>

        {/* Role assignments */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
            <h3 className="font-bold text-sm">Role Assignments <span className="text-muted text-xs font-normal ml-1.5">{assignments.length}</span></h3>
            <button onClick={() => setShowAssign(true)} className="btn btn-primary btn-sm">+ Assign Role</button>
          </div>

          {assignments.length === 0
            ? <div className="py-8 text-center text-muted text-sm">No roles assigned yet.</div>
            : assignments.map((a) => (
              <div key={a.assignmentId} className="flex items-center gap-3 px-5 py-3.5 border-b border-line-soft last:border-b-0 hover:bg-canvas-soft">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-brand-deep mb-1">{a.roleName}</div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${SCOPE_BADGE[a.resourceType]}`}>
                      {a.resourceType.replace("_", " ")}
                    </span>
                    {a.resourceName && a.resourceName !== "Global" && (
                      <span className="text-[12px] text-muted">{a.resourceName}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => removeAssignment(a.assignmentId)} title="Remove"
                  className="text-muted hover:text-red-500 transition-colors shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))
          }
        </div>
      </div>

      {showAssign && (
        <AssignRoleModal
          roles={roles} sources={sources} schemas={schemas} tables={tables}
          teamId={team.teamId}
          onDone={() => { setShowAssign(false); router.refresh(); }}
          onClose={() => setShowAssign(false)}
        />
      )}

      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl w-[480px] border border-line">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="font-bold text-brand-deep">Edit Team</h2>
              <button onClick={() => setShowEdit(false)} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5">
              <TeamForm team={team} onClose={() => { setShowEdit(false); router.refresh(); }} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
