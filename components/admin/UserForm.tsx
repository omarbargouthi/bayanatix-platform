"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SYSTEM_ROLES = ["ADMIN", "STEWARD", "OFFICER", "VIEWER"];

type Props = {
  onClose?: () => void;
};

export function UserForm({ onClose }: Props) {
  const router = useRouter();
  const [f, setF] = useState({
    userId: "", email: "", fullName: "", systemRole: "VIEWER", password: "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.userId || !f.email || !f.fullName || !f.password) {
      setErr("All fields are required."); return;
    }
    setSaving(true); setErr("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error ?? "Failed to create user."); return;
    }
    router.refresh();
    onClose?.();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {err && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-md">{err}</p>}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Username / ID *">
          <input value={f.userId} onChange={set("userId")} placeholder="e.g. nora.alkhalidi"
            className="input-field" />
        </Field>
        <Field label="Full Name *">
          <input value={f.fullName} onChange={set("fullName")} placeholder="Nora Al-Khalidi"
            className="input-field" />
        </Field>
      </div>

      <Field label="Email *">
        <input type="email" value={f.email} onChange={set("email")} placeholder="nora@bayanatix.demo"
          className="input-field" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="System Role">
          <select value={f.systemRole} onChange={set("systemRole")} className="input-field">
            {SYSTEM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Password *">
          <input type="password" value={f.password} onChange={set("password")} placeholder="••••••••"
            className="input-field" />
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-line-soft">
        {onClose && <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>}
        <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
          {saving ? "Creating…" : "Create User"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">{label}</label>
      {children}
    </div>
  );
}
