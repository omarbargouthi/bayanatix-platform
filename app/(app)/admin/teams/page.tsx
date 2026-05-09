"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Team } from "@/lib/types";
import { TeamForm } from "@/components/admin/TeamForm";

export default function TeamsPage() {
  const [teams,    setTeams]    = useState<Team[]>([]);
  const [loading,  setLoading]  = useState(true);
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
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-7">
        <Stat label="Total Teams"  value={teams.length} />
        <Stat label="Total Members" value={teams.reduce((s, t) => s + t.memberCount, 0)} color="blue" />
        <Stat label="Role Assignments" value={teams.reduce((s, t) => s + t.roleCount, 0)} color="purple" />
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

        {teams.map((t) => (
          <div key={t.teamId} className="grid grid-cols-[2fr_3fr_0.8fr_0.8fr_1fr] gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-brand-purple/10 text-brand-purple text-[11px] font-extrabold grid place-items-center shrink-0">
                {t.teamName.slice(0, 2).toUpperCase()}
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
            <div className="px-6 py-5">
              <TeamForm onClose={() => { setShowForm(false); load(); }} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, color = "green" }: { label: string; value: number; color?: "green"|"blue"|"purple" }) {
  const ring = { green: "border-l-emerald-400 bg-emerald-50/60", blue: "border-l-blue-400 bg-blue-50/60", purple: "border-l-brand-purple bg-brand-purple/5" }[color];
  const text = { green: "text-emerald-600", blue: "text-blue-600", purple: "text-brand-purple" }[color];
  return (
    <div className={`card border-l-4 ${ring} px-5 py-4`}>
      <div className={`text-2xl font-extrabold ${text}`}>{value}</div>
      <div className="text-[11px] text-muted mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}
