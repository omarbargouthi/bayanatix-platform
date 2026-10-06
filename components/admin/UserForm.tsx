"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SYSTEM_ROLES = ["ADMIN", "STEWARD", "OFFICER", "VIEWER"];

type Props = {
  onClose?: () => void;
  onCreated?: () => void;
};

// "John Tiger" → "john.tiger", "Khaled Al-Mansour" → "khaled.almansour": first name,
// dot, the rest joined — one convention for every new user.
export function suggestUsername(fullName: string): string {
  const parts = fullName.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/).map((p) => p.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0] : `${parts[0]}.${parts.slice(1).join("")}`;
}

export function UserForm({ onClose, onCreated }: Props) {
  const router = useRouter();
  const [f, setF] = useState({
    userId: "", email: "", fullName: "", systemRole: "VIEWER", password: "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");
  // Until the admin edits the username themselves, it follows the full name.
  const [usernameEdited, setUsernameEdited] = useState(false);

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
    onCreated?.();
    onClose?.();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {err && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-md">{err}</p>}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Full Name *">
          <input value={f.fullName} placeholder="Nora Al-Khalidi" className="input-field" autoComplete="off"
            onChange={(e) => setF((prev) => ({ ...prev, fullName: e.target.value, userId: usernameEdited ? prev.userId : suggestUsername(e.target.value) }))} />
        </Field>
        <Field label="Username *">
          <input value={f.userId} placeholder="nora.alkhalidi" className="input-field" autoComplete="off"
            onChange={(e) => { setUsernameEdited(true); setF((prev) => ({ ...prev, userId: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") })); }} />
        </Field>
      </div>
      <p className="text-[11px] text-muted -mt-2">
        The username is an internal id suggested from the name (first.last). It can&apos;t be changed later. People sign in with their email address.
      </p>

      <Field label="Email *">
        <input type="email" value={f.email} onChange={set("email")} placeholder="name@your-company.com"
          className="input-field" autoComplete="off" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="System Role">
          <select value={f.systemRole} onChange={set("systemRole")} className="input-field">
            {SYSTEM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Password *">
          <input type="password" value={f.password} onChange={set("password")} placeholder="••••••••"
            className="input-field" autoComplete="new-password" />
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
