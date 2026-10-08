"use client";

import { useCallback, useEffect, useState } from "react";

// The LDAP directories behind "LDAP / Active Directory" sign-in (db/157). Each one is
// saved on its own — independently of the Authentication page's Save button — and has
// its own switch: only enabled directories are offered on the sign-in screen.

type Directory = {
  directoryId: number;
  directoryName: string;
  isEnabled: boolean;
  ldapUrl: string | null;
  ldapUseStartTls: boolean;
  ldapBindDn: string | null;
  hasBindCredential: boolean;
  ldapBaseDn: string | null;
  ldapUserFilter: string | null;
  ldapEmailAttr: string | null;
  ldapNameAttr: string | null;
  userCount: number;
};

type Draft = Omit<Directory, "directoryId" | "hasBindCredential" | "userCount"> & { bindPassword: string };

const BLANK: Draft = {
  directoryName: "", isEnabled: true, ldapUrl: "", ldapUseStartTls: false, ldapBindDn: "", bindPassword: "",
  ldapBaseDn: "", ldapUserFilter: "(mail={{username}})", ldapEmailAttr: "mail", ldapNameAttr: "displayName",
};

const draftOf = (d: Directory): Draft => ({
  directoryName: d.directoryName, isEnabled: d.isEnabled, ldapUrl: d.ldapUrl ?? "", ldapUseStartTls: d.ldapUseStartTls,
  ldapBindDn: d.ldapBindDn ?? "", bindPassword: "", ldapBaseDn: d.ldapBaseDn ?? "",
  ldapUserFilter: d.ldapUserFilter ?? "", ldapEmailAttr: d.ldapEmailAttr ?? "", ldapNameAttr: d.ldapNameAttr ?? "",
});

const bodyOf = (d: Draft) => ({
  directoryName: d.directoryName, isEnabled: d.isEnabled, ldapUrl: d.ldapUrl || null, ldapUseStartTls: d.ldapUseStartTls,
  ldapBindDn: d.ldapBindDn || null, ldapBaseDn: d.ldapBaseDn || null, ldapUserFilter: d.ldapUserFilter || null,
  ldapEmailAttr: d.ldapEmailAttr || null, ldapNameAttr: d.ldapNameAttr || null,
  ...(d.bindPassword.trim() ? { ldapBindPassword: d.bindPassword.trim() } : {}),
});

export function LdapDirectoriesEditor() {
  const [directories, setDirectories] = useState<Directory[] | null>(null);
  const [openId, setOpenId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; ok: boolean; message: string } | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/ldap-directories");
    if (r.ok) setDirectories(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  function open(id: number | "new") {
    setError(null); setTestResult(null);
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setDraft(id === "new" ? { ...BLANK } : draftOf(directories!.find((d) => d.directoryId === id)!));
  }

  async function request(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true); setError(null);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? "The change could not be saved."); return false; }
      await load();
      return true;
    } finally { setBusy(false); }
  }

  async function save() {
    const ok = openId === "new"
      ? await request("/api/admin/ldap-directories", "POST", bodyOf(draft))
      : await request(`/api/admin/ldap-directories/${openId}`, "PATCH", bodyOf(draft));
    if (ok) { if (openId === "new") setOpenId(null); else setDraft((d) => ({ ...d, bindPassword: "" })); }
  }

  async function toggle(d: Directory) {
    await request(`/api/admin/ldap-directories/${d.directoryId}`, "PATCH", { isEnabled: !d.isEnabled });
    if (openId === d.directoryId) setDraft((cur) => ({ ...cur, isEnabled: !d.isEnabled }));
  }

  async function remove(d: Directory) {
    const warn = d.userCount > 0 ? ` ${d.userCount} user(s) signed in through it will no longer be able to sign in.` : "";
    if (!confirm(`Delete the directory "${d.directoryName}"?${warn}`)) return;
    if (await request(`/api/admin/ldap-directories/${d.directoryId}`, "DELETE")) setOpenId(null);
  }

  async function test(id: number) {
    setTestingId(id); setTestResult(null);
    try {
      const r = await fetch("/api/admin/auth-settings/test", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "LDAP", directoryId: id }),
      });
      const body = await r.json().catch(() => ({}));
      setTestResult({ id, ...(r.ok && typeof body.ok === "boolean" ? body : { ok: false, message: body.error || `Test failed (HTTP ${r.status})` }) });
    } catch {
      setTestResult({ id, ok: false, message: "Network error — couldn't reach the server." });
    } finally { setTestingId(null); }
  }

  if (!directories) return <div className="text-xs text-muted">Loading directories…</div>;

  const saved = typeof openId === "number" ? directories.find((d) => d.directoryId === openId) ?? null : null;
  const dirty = openId === "new" || (saved != null && JSON.stringify(draft) !== JSON.stringify(draftOf(saved)));
  const enabledCount = directories.filter((d) => d.isEnabled).length;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const form = (
    <div className="space-y-3 px-4 py-4 bg-canvas-soft border-t border-line-soft">
      <Field label="Name (shown on the sign-in screen)" placeholder="Employees" value={draft.directoryName} onChange={(v) => set("directoryName", v)} />
      <Field label="Server URL" placeholder="ldaps://dc01.corp.example.com:636" value={draft.ldapUrl ?? ""} onChange={(v) => set("ldapUrl", v)} />
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" className="w-4 h-4 accent-brand-purple" checked={draft.ldapUseStartTls} onChange={(e) => set("ldapUseStartTls", e.target.checked)} />
        Use StartTLS (for a plain <code className="font-mono text-xs">ldap://</code> URL — not needed for <code className="font-mono text-xs">ldaps://</code>)
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bind DN (service account)" placeholder="CN=svc-bayanis,OU=Service Accounts,DC=corp,DC=example,DC=com" value={draft.ldapBindDn ?? ""} onChange={(v) => set("ldapBindDn", v)} />
        <Field label={`Bind password ${saved?.hasBindCredential ? "(set — leave blank to keep)" : ""}`} type="password"
          placeholder={saved?.hasBindCredential ? "••••••••" : ""} value={draft.bindPassword} onChange={(v) => set("bindPassword", v)} />
      </div>
      <Field label="Base DN — the branch this directory's users are under" placeholder="OU=Contractors,DC=corp,DC=example,DC=com" value={draft.ldapBaseDn ?? ""} onChange={(v) => set("ldapBaseDn", v)} />
      <Field label="User search filter" placeholder="(mail={{username}})" value={draft.ldapUserFilter ?? ""} onChange={(v) => set("ldapUserFilter", v)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email attribute" placeholder="mail" value={draft.ldapEmailAttr ?? ""} onChange={(v) => set("ldapEmailAttr", v)} />
        <Field label="Display name attribute" placeholder="displayName" value={draft.ldapNameAttr ?? ""} onChange={(v) => set("ldapNameAttr", v)} />
      </div>
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={save} disabled={busy || !dirty} className="btn btn-primary btn-sm">{busy ? "Saving…" : openId === "new" ? "Add directory" : "Save directory"}</button>
        {saved && (
          <button onClick={() => test(saved.directoryId)} disabled={testingId != null || dirty} title={dirty ? "Save your changes first" : ""} className="btn btn-sm">
            {testingId === saved.directoryId ? "Testing…" : "Test Connection"}
          </button>
        )}
        {saved && dirty && <span className="text-[11px] text-amber-700">Save your changes first to test them.</span>}
        <span className="flex-1" />
        {saved && <button onClick={() => remove(saved)} disabled={busy} className="text-[12px] text-red-600 hover:underline">Delete directory</button>}
        {openId === "new" && <button onClick={() => setOpenId(null)} className="btn btn-sm">Cancel</button>}
      </div>
      {saved && testResult?.id === saved.directoryId && (
        <div className={`text-sm rounded-md px-3 py-2 border ${testResult.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}>{testResult.message}</div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-ink uppercase tracking-wide">Directories <span className="font-normal text-muted normal-case">· {enabledCount} of {directories.length} shown on the sign-in screen</span></div>
        <button onClick={() => open("new")} className="btn btn-sm text-xs">+ Add directory</button>
      </div>

      {directories.length === 0 && openId !== "new" && (
        <div className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          No directory yet — LDAP sign-in is not offered until one is added and enabled.
        </div>
      )}
      {directories.length > 0 && enabledCount === 0 && (
        <div className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Every directory is switched off — LDAP sign-in is not offered on the sign-in screen.
        </div>
      )}

      <div className="rounded-lg border border-line overflow-hidden divide-y divide-line-soft bg-white">
        {directories.map((d) => (
          <div key={d.directoryId}>
            <div className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => open(d.directoryId)} className="flex-1 min-w-0 text-start">
                <div className={`text-sm font-semibold truncate ${d.isEnabled ? "text-ink" : "text-muted"}`}>{d.directoryName}</div>
                <div className="text-[11px] text-muted truncate font-mono" dir="ltr">{d.ldapBaseDn || d.ldapUrl || "not configured"}</div>
              </button>
              <span className="text-[11px] text-muted whitespace-nowrap">{d.userCount} user{d.userCount === 1 ? "" : "s"}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-[92px] text-center ${d.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {d.isEnabled ? "On sign-in" : "Hidden"}
              </span>
              <button role="switch" aria-checked={d.isEnabled} aria-label={`Show ${d.directoryName} on the sign-in screen`} disabled={busy} onClick={() => toggle(d)}
                className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${d.isEnabled ? "bg-brand-purple" : "bg-gray-300"}`}>
                <span className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${d.isEnabled ? "translate-x-[18px]" : "translate-x-0.5"}`} />
              </button>
              <button onClick={() => open(d.directoryId)} className="text-muted text-[11px] w-4">{openId === d.directoryId ? "▲" : "▼"}</button>
            </div>
            {openId === d.directoryId && form}
          </div>
        ))}
        {openId === "new" && <div><div className="px-4 py-3 text-sm font-semibold text-brand-deep">New directory</div>{form}</div>}
      </div>
      {error && openId == null && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">{label}</label>
      <input type={type} className="input w-full bg-white" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
    </div>
  );
}
