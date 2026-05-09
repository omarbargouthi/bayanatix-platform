"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/types";
import { UserForm } from "@/components/admin/UserForm";
import { IconShield, IconUserPlus } from "@/components/layout/icons";

const ROLE_BADGE: Record<string, string> = {
  ADMIN:   "bg-purple-100 text-purple-700",
  STEWARD: "bg-blue-100   text-blue-700",
  OFFICER: "bg-amber-100  text-amber-700",
  VIEWER:  "bg-gray-100   text-gray-600",
};

export function UsersPageClient({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [search,   setSearch]   = useState("");

  const filtered = users.filter((u) =>
    u.fullName.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  async function toggleActive(u: AdminUser) {
    await fetch(`/api/admin/users/${u.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    router.refresh();
  }

  return (
    <main className="px-8 py-7 pb-14">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        <Stat label="Total Users"   value={users.length} />
        <Stat label="Active"        value={users.filter((u) => u.isActive).length} color="green" />
        <Stat label="Inactive"      value={users.filter((u) => !u.isActive).length} color="amber" />
        <Stat label="Admins"        value={users.filter((u) => u.systemRole === "ADMIN").length} color="purple" />
      </div>

      {/* Table card */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft gap-4">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="flex-1 flex items-center gap-2 bg-canvas border border-line rounded-md px-3 py-1.5">
              <svg className="w-3.5 h-3.5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users…" className="bg-transparent border-0 outline-none text-sm flex-1" />
            </div>
          </div>
          <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm flex items-center gap-1.5">
            <IconUserPlus className="w-4 h-4" /> Invite User
          </button>
        </div>

        <div className="grid grid-cols-[2fr_2fr_1fr_0.8fr_0.8fr_1fr] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
          <div>User</div><div>Email</div><div>System Role</div><div>Teams</div><div>Status</div><div>Actions</div>
        </div>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted text-sm">No users found.</div>
        )}

        {filtered.map((u) => (
          <div key={u.userId} className="grid grid-cols-[2fr_2fr_1fr_0.8fr_0.8fr_1fr] gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors">
            <div>
              <div className="font-semibold text-brand-deep flex items-center gap-1.5">
                <span className="w-7 h-7 rounded-full bg-brand-purple/15 text-brand-purple text-[11px] font-bold grid place-items-center shrink-0">
                  {u.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
                <Link href={`/admin/users/${u.userId}`} className="hover:underline">{u.fullName}</Link>
              </div>
              <div className="text-[11px] text-muted ml-8.5 pl-0.5">{u.userId}</div>
            </div>
            <div className="text-ink-soft text-[13px]">{u.email}</div>
            <div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[u.systemRole] ?? "bg-gray-100 text-gray-600"}`}>
                {u.systemRole}
              </span>
            </div>
            <div className="text-ink-soft">{u.teamCount || "—"}</div>
            <div>
              <span className={`text-[11px] font-semibold ${u.isActive ? "text-emerald-600" : "text-red-500"}`}>
                {u.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/admin/users/${u.userId}`} className="btn btn-sm text-xs">Manage</Link>
              <button onClick={() => toggleActive(u)} className="btn btn-sm text-xs">
                {u.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create user modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl w-[560px] border border-line">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="font-bold text-brand-deep">Invite New User</h2>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5">
              <UserForm onClose={() => setShowForm(false)} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, color = "blue" }: { label: string; value: number; color?: "blue"|"green"|"amber"|"purple" }) {
  const ring = { blue: "border-l-blue-400 bg-blue-50/60", green: "border-l-emerald-400 bg-emerald-50/60", amber: "border-l-amber-400 bg-amber-50/60", purple: "border-l-brand-purple bg-brand-purple/5" }[color];
  const text = { blue: "text-blue-600", green: "text-emerald-600", amber: "text-amber-600", purple: "text-brand-purple" }[color];
  return (
    <div className={`card border-l-4 ${ring} px-5 py-4`}>
      <div className={`text-2xl font-extrabold ${text}`}>{value}</div>
      <div className="text-[11px] text-muted mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}
