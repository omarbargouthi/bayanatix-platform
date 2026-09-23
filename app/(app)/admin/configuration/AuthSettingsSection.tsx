"use client";

import { useEffect, useState } from "react";

type AuthSettings = {
  localEnabled: boolean;
  ldapEnabled: boolean;
  oidcEnabled: boolean;
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState<"LDAP" | "OIDC" | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

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
    setSaveError(null);
    try {
      const patch: Record<string, unknown> = {
        localEnabled: form.localEnabled,
        ldapEnabled: form.ldapEnabled,
        oidcEnabled: form.oidcEnabled,
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
      const body = await r.json();
      if (!r.ok) { setSaveError(body.error || "Failed to save"); return; }
      setSettings(body);
      setForm(body);
      setLdapBindPassword(BLANK_SECRET);
      setOidcClientSecret(BLANK_SECRET);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(provider: "LDAP" | "OIDC") {
    setTesting(provider);
    try {
      const r = await fetch("/api/admin/auth-settings/test", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }),
      });
      const result = await r.json();
      setTestResults((prev) => ({ ...prev, [provider]: result }));
    } finally {
      setTesting(null);
    }
  }

  if (!settings || !form) {
    return <div className="text-sm text-muted">Loading…</div>;
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(settings)
    || ldapBindPassword.trim() !== "" || oidcClientSecret.trim() !== ""
    || (scopeMode === "GLOBAL") !== !settings.autoProvisionSourceIds?.length;

  const enabledCount = [form.localEnabled, form.ldapEnabled, form.oidcEnabled].filter(Boolean).length;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">Authentication</h2>
        <p className="text-xs text-muted mt-1">
          Configure any combination of sign-in methods below and turn each on or off — everyone signing in
          picks from whichever methods are enabled on the login screen. At least one must stay enabled.
        </p>
      </div>

      <div className="space-y-4">
        {/* ── LOCAL ── */}
        <ProviderCard
          title="Local (email + password)"
          description="The built-in username/password store — always the simplest fallback."
          enabled={form.localEnabled}
          onToggle={(v) => setForm({ ...form, localEnabled: v })}
        />

        {/* ── LDAP ── */}
        <ProviderCard
          title="LDAP / Active Directory"
          description="On-prem Active Directory or any LDAPv3 directory, via search + bind."
          enabled={form.ldapEnabled}
          onToggle={(v) => setForm({ ...form, ldapEnabled: v })}
        >
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
          <TestRow result={testResults.LDAP} testing={testing === "LDAP"} disabled={dirty}
            onTest={() => handleTest("LDAP")} />
        </ProviderCard>

        {/* ── OIDC ── */}
        <ProviderCard
          title="OIDC (Entra ID / SSO)"
          description="Authorization Code + PKCE against any OIDC issuer — the native path for Microsoft Entra ID."
          enabled={form.oidcEnabled}
          onToggle={(v) => setForm({ ...form, oidcEnabled: v })}
        >
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
          <TestRow result={testResults.OIDC} testing={testing === "OIDC"} disabled={dirty}
            onTest={() => handleTest("OIDC")} />
        </ProviderCard>

        {/* ── New User Access (applies to whichever external method provisions the user) ── */}
        {(form.ldapEnabled || form.oidcEnabled) && (
          <div className="card p-5 space-y-3">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wide">New User Access</h3>
            <p className="text-[11px] text-muted">
              A user signing in for the first time via LDAP or SSO is created automatically with
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

        {saveError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{saveError}</div>
        )}
        {enabledCount === 0 && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            At least one sign-in method must stay enabled.
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving || !dirty || enabledCount === 0} className="btn btn-primary btn-sm">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({
  title, description, enabled, onToggle, children,
}: {
  title: string; description: string; enabled: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          <p className="text-xs text-muted mt-0.5">{description}</p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${enabled ? "bg-brand-purple" : "bg-gray-300"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-[22px]" : "translate-x-0.5"}`} />
        </button>
      </div>
      {enabled && children && (
        <div className="space-y-3 pt-4 mt-4 border-t border-line-soft">{children}</div>
      )}
    </div>
  );
}

function TestRow({
  result, testing, disabled, onTest,
}: {
  result?: { ok: boolean; message: string }; testing: boolean; disabled: boolean; onTest: () => void;
}) {
  return (
    <div className="pt-1 space-y-2">
      <button onClick={onTest} disabled={testing || disabled} title={disabled ? "Save your changes first" : ""} className="btn btn-sm">
        {testing ? "Testing…" : "Test Connection"}
      </button>
      {result && (
        <div className={`text-sm rounded-md px-3 py-2 border ${result.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}>
          {result.message}
        </div>
      )}
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
