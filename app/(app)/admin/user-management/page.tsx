"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { UsersPageClient } from "@/app/(app)/admin/users/UsersPageClient";
import { TagsClient } from "@/app/(app)/admin/tags/TagsClient";
import type { AdminUser, TagRecord, Role, Team } from "@/lib/types";
import { RoleForm } from "@/components/admin/RoleForm";
import { TeamForm } from "@/components/admin/TeamForm";

// ── Users section ────────────────────────────────────────────────────────────

function UsersSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  useEffect(() => {
    fetch("/api/admin/users").then(r => r.json()).then(setUsers);
  }, []);
  return <UsersPageClient users={users} />;
}

// ── Roles section ─────────────────────────────────────────────────────────────

function RolesSection() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

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
      <div className="grid grid-cols-4 gap-4 mb-7">
        {[["Total Roles", roles.length, "blue"], ["Admin Roles", roles.filter(r => r.isAdmin).length, "purple"],
          ["User Assignments", roles.reduce((s,r)=>s+r.userCount,0), "blue"],
          ["Team Assignments", roles.reduce((s,r)=>s+r.teamCount,0), "green"]
        ].map(([label, value, color]) => <StatCard key={label as string} label={label as string} value={value as number} color={color as "blue"|"green"|"purple"} />)}
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
        {roles.map(r => (
          <div key={r.roleId} className="grid grid-cols-[2fr_2fr_2fr_0.8fr_0.8fr_1fr] gap-3 px-5 py-4 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft">
            <div className="font-semibold text-brand-deep">{r.isAdmin && "🛡 "}{r.roleName}</div>
            <div className="text-ink-soft text-[13px] line-clamp-2">{r.description ?? "—"}</div>
            <div className="flex flex-wrap gap-1">
              {r.isAdmin
                ? <Priv on label="Admin" />
                : <><Priv on={r.metadataRead} label="Meta R" /><Priv on={r.metadataWrite} label="Meta W" /><Priv on={r.dataRead} label="Data R" /></>}
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
            <div className="px-6 py-5"><RoleForm onClose={() => { setShowForm(false); load(); }} /></div>
          </div>
        </div>
      )}
    </main>
  );
}

function Priv({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${on ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
      {on ? "✓" : "—"} {label}
    </span>
  );
}

// ── Teams section ─────────────────────────────────────────────────────────────

function TeamsSection() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/teams");
    setTeams(await r.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function deleteTeam(id: number) {
    if (!confirm("Delete this team?")) return;
    await fetch(`/api/admin/teams/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="px-8 py-7 pb-14">
      <div className="grid grid-cols-3 gap-4 mb-7">
        {[["Total Teams", teams.length, "green"], ["Total Members", teams.reduce((s,t)=>s+t.memberCount,0), "blue"],
          ["Role Assignments", teams.reduce((s,t)=>s+t.roleCount,0), "purple"]
        ].map(([label, value, color]) => <StatCard key={label as string} label={label as string} value={value as number} color={color as "blue"|"green"|"purple"} />)}
      </div>
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
          <h3 className="font-bold">Teams <span className="text-muted text-xs font-normal ml-2">{teams.length} teams</span></h3>
          <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">+ New Team</button>
        </div>
        <div className="grid grid-cols-[2fr_3fr_0.8fr_0.8fr_1fr] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
          <div>Team</div><div>Description</div><div>Members</div><div>Roles</div><div>Actions</div>
        </div>
        {loading && <div className="py-10 text-center text-muted text-sm">Loading…</div>}
        {teams.map(t => (
          <div key={t.teamId} className="grid grid-cols-[2fr_3fr_0.8fr_0.8fr_1fr] gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-brand-purple/10 text-brand-purple text-[11px] font-extrabold grid place-items-center shrink-0">
                {t.teamName.slice(0,2).toUpperCase()}
              </span>
              <div>
                <div className="font-semibold text-brand-deep">{t.teamName}</div>
                <div className="text-[11px] text-muted">{new Date(t.createdAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div>
              </div>
            </div>
            <div className="text-ink-soft text-[13px] line-clamp-2">{t.description ?? "—"}</div>
            <div className="font-semibold text-brand-deep text-center">{t.memberCount || "—"}</div>
            <div className="font-semibold text-brand-deep text-center">{t.roleCount || "—"}</div>
            <div className="flex items-center gap-2">
              <Link href={`/admin/teams/${t.teamId}`} className="btn btn-sm text-xs">Manage</Link>
              <button onClick={() => deleteTeam(t.teamId)} className="btn btn-sm text-xs text-red-600 hover:bg-red-50">Delete</button>
            </div>
          </div>
        ))}
      </div>
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl w-[480px] border border-line">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="font-bold text-brand-deep">New Team</h2>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5"><TeamForm onClose={() => { setShowForm(false); load(); }} /></div>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Tags section ──────────────────────────────────────────────────────────────

function TagsSection() {
  const [tags, setTags] = useState<TagRecord[]>([]);
  useEffect(() => {
    fetch("/api/admin/tags").then(r => r.json()).then(setTags);
  }, []);
  return <TagsClient tags={tags} />;
}

// ── Shared stat card ──────────────────────────────────────────────────────────

function StatCard({ label, value, color = "blue" }: { label: string; value: number; color?: "blue"|"green"|"purple" }) {
  const ring = { blue: "border-l-blue-400 bg-blue-50/60", green: "border-l-emerald-400 bg-emerald-50/60", purple: "border-l-brand-purple bg-brand-purple/5" }[color];
  const text = { blue: "text-blue-600", green: "text-emerald-600", purple: "text-brand-purple" }[color];
  return (
    <div className={`card border-l-4 ${ring} px-5 py-4`}>
      <div className={`text-2xl font-extrabold ${text}`}>{value}</div>
      <div className="text-[11px] text-muted mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}

// ── Sub-tab nav ───────────────────────────────────────────────────────────────

const SUB_TABS = [
  { id: "users", label: "Users" },
  { id: "roles", label: "Roles" },
  { id: "teams", label: "Teams" },
  { id: "tags",  label: "Tags"  },
];

function UserManagementInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") ?? "users";

  return (
    <div>
      <div className="border-b border-line bg-white px-8">
        <nav className="flex items-center gap-0">
          {SUB_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => router.replace(`/admin/user-management?tab=${t.id}`)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "text-brand-purple border-brand-purple"
                  : "text-ink-soft border-transparent hover:text-brand-deep hover:border-brand-purple/30"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "users" && <UsersSection />}
      {tab === "roles" && <RolesSection />}
      {tab === "teams" && <TeamsSection />}
      {tab === "tags"  && <TagsSection />}
    </div>
  );
}

export default function UserManagementPage() {
  return (
    <Suspense>
      <UserManagementInner />
    </Suspense>
  );
}
