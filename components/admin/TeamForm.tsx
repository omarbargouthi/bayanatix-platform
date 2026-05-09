"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Team } from "@/lib/types";

type Props = { team?: Team; onClose?: () => void };

export function TeamForm({ team, onClose }: Props) {
  const router  = useRouter();
  const editing = !!team;
  const [name, setName] = useState(team?.teamName    ?? "");
  const [desc, setDesc] = useState(team?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) { setErr("Team name is required."); return; }
    setSaving(true); setErr("");

    const url = editing ? `/api/admin/teams/${team!.teamId}` : "/api/admin/teams";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName: name, description: desc }),
    });
    setSaving(false);
    if (!res.ok) { setErr("Failed to save team."); return; }
    if (!editing) {
      const { teamId } = await res.json();
      router.push(`/admin/teams/${teamId}`);
    } else {
      router.refresh(); onClose?.();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {err && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-md">{err}</p>}

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Team Name *</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Finance Team" className="input-field" />
      </div>
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Description</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
          placeholder="Briefly describe this team's purpose" className="input-field resize-none" />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-line-soft">
        {onClose && <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>}
        <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
          {saving ? "Saving…" : editing ? "Save Changes" : "Create Team"}
        </button>
      </div>
    </form>
  );
}
