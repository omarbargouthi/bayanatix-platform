"use client";

import { useEffect, useState } from "react";

type ProviderType = "LOCAL" | "LDAP" | "OIDC";

type AuthSettings = {
  providerType: ProviderType;
  ldapUrl: string | null;
  ldapUseStartTls: boolean;
  ldapBindDn: string | null;
  ldapHasBindCredential: boolean;
  ldapBaseDn: string | null;
  ldapUserFilter: string | null;
  ldapEmailAttr: string | null;
  ldapNameAttr: string | null;
  oidcIssuerUrl: string | null;
  oidcClientId: string | null;
  oidcHasClientCredential: boolean;
  oidcRedirectUri: string | null;
  oidcScopes: string | null;
  autoProvisionRoleId: number | null;
  autoProvisionSourceIds: number[] | null;
};

type DataSourceLite = { id: number; name: string };

const BLANK_SECRET = ""; // never pre-filled — write-only, same convention as LLM provider credentials

export function AuthSettingsSection() {
  const [settings, setSettings] = useState<AuthSettings | null>(null);
  const [sources, setSources] = useState<DataSourceLite[]>([]);
  const [form, setForm] = useState<AuthSettings | null>(null);
  const [ldapBindPassword, setLdapBindPassword] = useState(BLANK_SECRET);
  const [oidcClientSecret, setOidcClientSecret] = useState(BLANK_SECRET);
  const [scopeMode, setScopeMode] = useState<"GLOBAL" | "SPECIFIC">("GLOBAL");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/auth-settings").then((r) => r.json()),
      fetch("/api/admin/data-sources-lite").then((r) => r.json()),
    ]).then(([s, ds]) => {
      setSettings(s);
      setForm(s);
      setScopeMode(s.autoProvisionSourceIds?.length ? "SPECIFIC" : "GLOBAL");
      setSources(ds);
    });
  }, []);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setTestResult(null);
    try {
      const patch: Record<string, unknown> = {
        providerType: form.providerType,
        ldapUrl: form.ldapUrl,
        ldapUseStartTls: form.ldapUseStartTls,
        ldapBindDn: form.ldapBindDn,
        ldapBaseDn: form.ldapBaseDn,
        ldapUserFilter: form.ldapUserFilter,
        ldapEmailAttr: form.ldapEmailAttr,
        ldapNameAttr: form.ldapNameAttr,
        oidcIssuerUrl: form.oidcIssuerUrl,
        oidcClientId: form.oidcClientId,
        oidcRedirectUri: form.oidcRedirectUri,
        oidcScopes: form.oidcScopes,
        autoProvisionSourceIds: scopeMode === "GLOBAL" ? null : form.autoProvisionSourceIds,
      };
      if (ldapBindPassword.trim()) patch.ldapBindPassword = ldapBindPassword.trim();
      if (oidcClientSecret.trim()) patch.oidcClientSecret = oidcClientSecret.trim();

      const r = await fetch("/api/admin/auth-settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error); return; }
      const updated = await r.json();
      setSettings(updated);
      setForm(updated);
      setLdapBindPassword(BLANK_SECRET);
      setOidcClientSecret(BLANK_SECRET);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/admin/auth-settings/test", { method: "POST" });
      setTestResult(await r.json());
    } finally {
      setTesting(false);
    }
  }

  if (!settings || !form) {
    return <div className="text-sm text-muted">Loading…</div>;
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(settings)
    || ldapBindPassword.trim() !== "" || oidcClientSecret.trim() !== ""
    || (scopeMode === "GLOBAL") !== !settings.autoProvisionSourceIds?.length;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">Authentication</h2>
        <p className="text-xs text-muted mt-1">
          How users sign in. LOCAL (email + password) always stays available as a fallback,
          even when LDAP or OIDC is the configured provider, so an admin can never be locked out.
        </p>
      </div>

      <div className="card p-5 space-y-5">
        <div>
          <label className="text-[10px] font-semibold text-muted uppercase mb-1.5 block">Provider</label>
          <div className="flex gap-2">
            {(["LOCAL", "LDAP", "OIDC"] as ProviderType[]).map((p) => (
              <button
                key={p}
                onClick={() => setForm({ ...form, providerType: p })}
                className={`btn btn-sm ${form.providerType === p ? "btn-primary" : ""}`}
              >
                {p === "LOCAL" ? "Local (email + password)" : p === "LDAP" ? "LDAP / Active Directory" : "OIDC (Entra ID / SSO)"}
              </button>
            ))}
          </div>
        </div>

        {form.providerType === "LDAP" && (
          <div className="space-y-3 pt-3 border-t border-line-soft">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wide">LDAP Configuration</h3>
            <Field label="Server URL" placeholder="ldaps://dc01.corp.example.com:636"
              value={form.ldapUrl ?? ""} onChange={(v) => setForm({ ...form, ldapUrl: v || null })} />
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="w-4 h-4 accent-brand-purple" checked={form.ldapUseStartTls}
                onChange={(e) => setForm({ ...form, ldapUseStartTls: e.target.checked })} />
              Use StartTLS (for a plain <code className="font-mono text-xs">ldap://</code> URL — not needed for <code className="font-mono text-xs">ldaps://</code>)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bind DN (service account)" placeholder="CN=svc-bayanatix,OU=Service Accounts,DC=corp,DC=example,DC=com"
                value={form.ldapBindDn ?? ""} onChange={(v) => setForm({ ...form, ldapBindDn: v || null })} />
              <Field label={`Bind password ${settings.ldapHasBindCredential ? "(set — leave blank to keep)" : ""}`}
                type="password" placeholder={settings.ldapHasBindCredential ? "••••••••" : ""}
                value={ldapBindPassword} onChange={setLdapBindPassword} />
            </div>
            <Field label="Base DN" placeholder="OU=Users,DC=corp,DC=example,DC=com"
              value={form.ldapBaseDn ?? ""} onChange={(v) => setForm({ ...form, ldapBaseDn: v || null })} />
            <Field label="User search filter" placeholder="(mail={{username}})"
              value={form.ldapUserFilter ?? ""} onChange={(v) => setForm({ ...form, ldapUserFilter: v || null })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email attribute" placeholder="mail"
                value={form.ldapEmailAttr ?? ""} onChange={(v) => setForm({ ...form, ldapEmailAttr: v || null })} />
              <Field label="Display name attribute" placeholder="displayName"
                value={form.ldapNameAttr ?? ""} onChange={(v) => setForm({ ...form, ldapNameAttr: v || null })} />
            </div>
          </div>
        )}

        {form.providerType === "OIDC" && (
          <div className="space-y-3 pt-3 border-t border-line-soft">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wide">OIDC Configuration</h3>
            <Field label="Issuer URL" placeholder="https://login.microsoftonline.com/{tenant-id}/v2.0"
              value={form.oidcIssuerUrl ?? ""} onChange={(v) => setForm({ ...form, oidcIssuerUrl: v || null })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client ID" value={form.oidcClientId ?? ""} onChange={(v) => setForm({ ...form, oidcClientId: v || null })} />
              <Field label={`Client secret ${settings.oidcHasClientCredential ? "(set — leave blank to keep)" : ""}`}
                type="password" placeholder={settings.oidcHasClientCredential ? "••••••••" : ""}
                value={oidcClientSecret} onChange={setOidcClientSecret} />
            </div>
            <Field label="Redirect URI" placeholder="http://localhost:3000/api/auth/oidc/callback"
              value={form.oidcRedirectUri ?? ""} onChange={(v) => setForm({ ...form, oidcRedirectUri: v || null })} />
            <Field label="Scopes" placeholder="openid profile email"
              value={form.oidcScopes ?? ""} onChange={(v) => setForm({ ...form, oidcScopes: v || null })} />
            <p className="text-[11px] text-muted">
              Register this app in Entra ID (App registrations → New registration), add the Redirect URI above
              under Authentication, and create a Client secret under Certificates &amp; secrets.
            </p>
          </div>
        )}

        {form.providerType !== "LOCAL" && (
          <div className="space-y-3 pt-3 border-t border-line-soft">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wide">New User Access</h3>
            <p className="text-[11px] text-muted">
              A user signing in for the first time via {form.providerType} is created automatically with
              read-only access (the &quot;External Viewer&quot; role) to the data below.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setScopeMode("GLOBAL")} className={`btn btn-sm ${scopeMode === "GLOBAL" ? "btn-primary" : ""}`}>
                All data sources
              </button>
              <button onClick={() => setScopeMode("SPECIFIC")} className={`btn btn-sm ${scopeMode === "SPECIFIC" ? "btn-primary" : ""}`}>
                Specific data sources
              </button>
            </div>
            {scopeMode === "SPECIFIC" && (
              <div className="flex flex-wrap gap-2 pt-1">
                {sources.map((s) => {
                  const selected = form.autoProvisionSourceIds?.includes(s.id) ?? false;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        const current = form.autoProvisionSourceIds ?? [];
                        const next = selected ? current.filter((id) => id !== s.id) : [...current, s.id];
                        setForm({ ...form, autoProvisionSourceIds: next });
                      }}
                      className={`text-[12px] px-2.5 py-1 rounded-full border transition-colors ${
                        selected ? "bg-brand-purple text-white border-brand-purple" : "bg-white border-line text-ink-soft hover:border-brand-purple"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
                {sources.length === 0 && <span className="text-xs text-muted">No data sources yet.</span>}
              </div>
            )}
          </div>
        )}

        {testResult && (
          <div className={`text-sm rounded-md px-3 py-2 border ${testResult.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}>
            {testResult.message}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={saving || !dirty} className="btn btn-primary btn-sm">
            {saving ? "Saving…" : "Save"}
          </button>
          {form.providerType !== "LOCAL" && (
            <button onClick={handleTest} disabled={testing || dirty} title={dirty ? "Save your changes first" : ""} className="btn btn-sm">
              {testing ? "Testing…" : "Test Connection"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">{label}</label>
      <input
        type={type}
        className="input w-full"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}
