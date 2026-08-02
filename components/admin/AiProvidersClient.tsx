"use client";

import { useState, useEffect, useCallback } from "react";

type Profile = {
  profileId: number; profileName: string; providerType: string; apiFlavor: string; baseUrl: string; modelName: string;
  hasCredential: boolean; credentialLast4: string | null; credentialRotatedAt: string | null; region: string | null;
  maxTokens: number; temperature: number; timeoutSeconds: number; dailyTokenBudget: number | null;
  isEnabled: boolean; isDefault: boolean; allowSampleValues: boolean; notes: string | null;
  healthStatus: string; healthCheckedAt: string | null; healthMessage: string | null;
};

type Route = { capabilityCode: string; profileId: number | null; fallbackProfileId: number | null };
type UsageRow = { profileId: number; profileName: string; capabilityCode: string; callsToday: number; tokensToday: number; failuresToday: number };

const BLANK_FORM = {
  profileName: "", providerType: "SELF_HOSTED", apiFlavor: "OPENAI_COMPAT", baseUrl: "", modelName: "",
  region: "", maxTokens: 2048, temperature: 0.2, timeoutSeconds: 60, dailyTokenBudget: "", allowSampleValues: false, notes: "",
};

const HEALTH_DOT: Record<string, string> = { HEALTHY: "bg-green-500", UNHEALTHY: "bg-red-500", UNKNOWN: "bg-gray-300" };
const CAPABILITY_LABELS: Record<string, string> = { DESCRIBE: "Description Generate", REPHRASE: "Description Rephrase", DQ_SEMANTIC: "DQ Semantic Rules (Tier 2)" };

export function AiProvidersClient() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; message: string }>>({});
  const [testingId, setTestingId] = useState<number | null>(null);
  const [credentialInputs, setCredentialInputs] = useState<Record<number, string>>({});
  const [savingRoutes, setSavingRoutes] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r, u] = await Promise.all([
        fetch("/api/admin/llm-providers").then((res) => res.json()),
        fetch("/api/admin/llm-capability-routes").then((res) => res.json()),
        fetch("/api/admin/llm-providers/usage").then((res) => res.json()),
      ]);
      setProfiles(p); setRoutes(r); setUsage(u);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createProfile() {
    if (!form.profileName || !form.baseUrl || !form.modelName) { alert("Name, Base URL, and Model are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/llm-providers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dailyTokenBudget: form.dailyTokenBudget ? Number(form.dailyTokenBudget) : null }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error); return; }
      setAdding(false); setForm({ ...BLANK_FORM });
      await load();
    } finally { setSaving(false); }
  }

  async function toggleEnabled(p: Profile) {
    await fetch(`/api/admin/llm-providers/${p.profileId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !p.isEnabled }),
    });
    await load();
  }

  async function setDefault(profileId: number) {
    await fetch(`/api/admin/llm-providers/${profileId}/set-default`, { method: "POST" });
    await load();
  }

  async function deleteProfile(p: Profile) {
    if (!confirm(`Delete provider profile "${p.profileName}"?`)) return;
    const res = await fetch(`/api/admin/llm-providers/${p.profileId}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? "Failed to delete"); return; }
    await load();
  }

  async function testConnection(profileId: number) {
    setTestingId(profileId);
    try {
      const res = await fetch(`/api/admin/llm-providers/${profileId}/test`, { method: "POST" });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [profileId]: res.ok
          ? { ok: true, message: `${data.latencyMs}ms · ${data.inputTokens + data.outputTokens} tokens` }
          : { ok: false, message: data.error },
      }));
      await load();
    } finally { setTestingId(null); }
  }

  async function setCredential(profileId: number) {
    const key = credentialInputs[profileId];
    if (!key?.trim()) return;
    const res = await fetch(`/api/admin/llm-providers/${profileId}/credential`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? "Failed to set credential"); return; }
    setCredentialInputs((prev) => ({ ...prev, [profileId]: "" }));
    await load();
  }

  async function saveRoute(capabilityCode: string, profileId: number | null, fallbackProfileId: number | null) {
    setSavingRoutes(true);
    try {
      await fetch("/api/admin/llm-capability-routes", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilityCode, profileId, fallbackProfileId }),
      });
      await load();
    } finally { setSavingRoutes(false); }
  }

  if (loading) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <div className="space-y-8">
      {/* ── Provider profiles ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Provider Profiles</h2>
            <p className="text-xs text-muted mt-1">Managed API, cloud-hosted in-region, or self-hosted open-weights — every profile speaks the OpenAI-compatible or native Anthropic API.</p>
          </div>
          <button onClick={() => setAdding((v) => !v)} className="btn btn-primary btn-sm">{adding ? "Cancel" : "+ Add Profile"}</button>
        </div>

        {adding && (
          <div className="bg-white border border-brand-purple rounded-xl p-5 mb-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Profile Name</label>
                <input value={form.profileName} onChange={(e) => setForm((f) => ({ ...f, profileName: e.target.value }))} className="input w-full" placeholder="e.g. Claude on Bedrock" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Provider Type</label>
                <select value={form.providerType} onChange={(e) => setForm((f) => ({ ...f, providerType: e.target.value }))} className="input w-full bg-white">
                  <option value="MANAGED_API">Managed API</option>
                  <option value="CLOUD_REGION">Cloud-hosted in-region</option>
                  <option value="SELF_HOSTED">Self-hosted</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">API Flavor</label>
                <select value={form.apiFlavor} onChange={(e) => setForm((f) => ({ ...f, apiFlavor: e.target.value }))} className="input w-full bg-white">
                  <option value="OPENAI_COMPAT">OpenAI-compatible (vLLM/Ollama/Azure/gateways)</option>
                  <option value="ANTHROPIC">Anthropic native</option>
                  <option value="BEDROCK">AWS Bedrock (not yet implemented)</option>
                  <option value="VERTEX">GCP Vertex AI (not yet implemented)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Base URL</label>
                <input value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} className="input w-full font-mono" placeholder="https://api.anthropic.com" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Model Name</label>
                <input value={form.modelName} onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))} className="input w-full font-mono" placeholder="claude-sonnet-5" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Region (cloud-hosted only)</label>
                <input value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} className="input w-full" placeholder="me-central-1" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Max Tokens</label>
                <input type="number" value={form.maxTokens} onChange={(e) => setForm((f) => ({ ...f, maxTokens: Number(e.target.value) }))} className="input w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Temperature</label>
                <input type="number" step="0.1" value={form.temperature} onChange={(e) => setForm((f) => ({ ...f, temperature: Number(e.target.value) }))} className="input w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Timeout (s)</label>
                <input type="number" value={form.timeoutSeconds} onChange={(e) => setForm((f) => ({ ...f, timeoutSeconds: Number(e.target.value) }))} className="input w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Daily Token Budget</label>
                <input type="number" value={form.dailyTokenBudget} onChange={(e) => setForm((f) => ({ ...f, dailyTokenBudget: e.target.value }))} className="input w-full" placeholder="blank = unlimited" />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" checked={form.allowSampleValues} onChange={(e) => setForm((f) => ({ ...f, allowSampleValues: e.target.checked }))} className="w-4 h-4 accent-brand-purple" />
                <label className="text-sm text-ink">Allow sample values in context</label>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Notes</label>
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input w-full" />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={createProfile} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Create Profile"}</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {profiles.map((p) => {
            const test = testResults[p.profileId];
            const usedToday = usage.filter((u) => u.profileId === p.profileId).reduce((s, u) => s + u.tokensToday, 0);
            const budgetPct = p.dailyTokenBudget ? (usedToday / p.dailyTokenBudget) * 100 : null;
            return (
              <div key={p.profileId} className={`bg-white border rounded-xl p-4 ${p.isDefault ? "border-brand-purple" : "border-line"}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${HEALTH_DOT[p.healthStatus] ?? "bg-gray-300"}`} title={p.healthMessage ?? p.healthStatus} />
                      <span className="font-semibold text-sm text-ink">{p.profileName}</span>
                      {p.isDefault && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple">DEFAULT</span>}
                      <span className="text-[10px] font-mono bg-canvas-soft px-1.5 py-0.5 rounded border border-line text-muted">{p.providerType}</span>
                      <span className="text-[10px] font-mono bg-canvas-soft px-1.5 py-0.5 rounded border border-line text-muted">{p.apiFlavor}</span>
                      {!p.isEnabled && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">DISABLED</span>}
                    </div>
                    <div className="text-[11px] text-muted mt-1 font-mono truncate">{p.baseUrl} · {p.modelName}</div>
                    {p.notes && <div className="text-[11px] text-muted mt-1 max-w-xl">{p.notes}</div>}
                    {budgetPct != null && (
                      <div className="text-[10px] mt-1.5 flex items-center gap-2">
                        <div className="w-32 h-1.5 rounded-full bg-line overflow-hidden">
                          <div className={`h-full ${budgetPct >= 100 ? "bg-red-500" : budgetPct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, budgetPct)}%` }} />
                        </div>
                        <span className="text-muted">{usedToday}/{p.dailyTokenBudget} tokens today</span>
                      </div>
                    )}
                    {test && <div className={`text-[11px] mt-1.5 ${test.ok ? "text-emerald-700" : "text-red-600"}`}>{test.ok ? "✓ " : "✗ "}{test.message}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => testConnection(p.profileId)} disabled={testingId === p.profileId} className="btn btn-sm text-[11px] px-2 py-1">
                      {testingId === p.profileId ? "…" : "Test Connection"}
                    </button>
                    {!p.isDefault && (
                      <button onClick={() => setDefault(p.profileId)} className="btn btn-sm text-[11px] px-2 py-1">Set Default</button>
                    )}
                    <button onClick={() => toggleEnabled(p)} className="btn btn-sm text-[11px] px-2 py-1">{p.isEnabled ? "Disable" : "Enable"}</button>
                    <button onClick={() => deleteProfile(p)} className="btn btn-sm text-[11px] px-2 py-1 text-red-600 border-red-200 hover:bg-red-50">Delete</button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line-soft">
                  <span className="text-[11px] text-muted shrink-0">
                    {p.hasCredential ? `Key: ••••${p.credentialLast4} (rotated ${p.credentialRotatedAt?.slice(0, 10)})` : "No credential set"}
                  </span>
                  <input
                    type="password" placeholder="Set/rotate API key…" value={credentialInputs[p.profileId] ?? ""}
                    onChange={(e) => setCredentialInputs((prev) => ({ ...prev, [p.profileId]: e.target.value }))}
                    className="flex-1 text-[11px] border border-line rounded px-2 py-1"
                  />
                  <button onClick={() => setCredential(p.profileId)} className="text-[11px] font-semibold text-brand-purple hover:underline shrink-0">Save Key</button>
                </div>
              </div>
            );
          })}
          {profiles.length === 0 && <div className="text-center text-muted text-sm py-10">No provider profiles yet.</div>}
        </div>
      </div>

      {/* ── Capability routing ────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-ink mb-1">Capability Routing</h2>
        <p className="text-xs text-muted mb-4">Route each enrichment capability to a specific profile, else the default profile is used. Fallback kicks in when the primary fails its health check.</p>
        <div className="bg-white border border-line rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-5 py-2.5 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
            <div>Capability</div><div>Profile</div><div>Fallback</div>
          </div>
          {routes.map((r) => (
            <div key={r.capabilityCode} className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-5 py-3 items-center border-b border-line-soft last:border-b-0">
              <div className="text-sm font-medium text-ink">{CAPABILITY_LABELS[r.capabilityCode] ?? r.capabilityCode}</div>
              <select
                value={r.profileId ?? ""} disabled={savingRoutes}
                onChange={(e) => saveRoute(r.capabilityCode, e.target.value ? Number(e.target.value) : null, r.fallbackProfileId)}
                className="text-[12px] border border-line rounded px-2 py-1.5 bg-white"
              >
                <option value="">(default profile)</option>
                {profiles.map((p) => <option key={p.profileId} value={p.profileId}>{p.profileName}</option>)}
              </select>
              <select
                value={r.fallbackProfileId ?? ""} disabled={savingRoutes}
                onChange={(e) => saveRoute(r.capabilityCode, r.profileId, e.target.value ? Number(e.target.value) : null)}
                className="text-[12px] border border-line rounded px-2 py-1.5 bg-white"
              >
                <option value="">(none)</option>
                {profiles.map((p) => <option key={p.profileId} value={p.profileId}>{p.profileName}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* ── Usage dashboard ───────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-ink mb-1">Usage Today</h2>
        <p className="text-xs text-muted mb-4">Tokens and failure rate per profile & capability, resets at midnight.</p>
        <div className="bg-white border border-line rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr] gap-3 px-5 py-2.5 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
            <div>Profile</div><div>Capability</div><div>Calls</div><div>Tokens</div><div>Failures</div>
          </div>
          {usage.map((u, i) => (
            <div key={i} className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr] gap-3 px-5 py-2.5 items-center border-b border-line-soft last:border-b-0 text-sm">
              <div className="text-ink truncate">{u.profileName}</div>
              <div className="text-ink-soft text-[12px]">{u.capabilityCode}</div>
              <div className="text-ink-soft text-[12px]">{u.callsToday}</div>
              <div className="text-ink-soft text-[12px]">{u.tokensToday}</div>
              <div className={u.failuresToday > 0 ? "text-red-600 text-[12px] font-semibold" : "text-ink-soft text-[12px]"}>{u.failuresToday}</div>
            </div>
          ))}
          {usage.length === 0 && <div className="text-center text-muted text-sm py-10">No calls yet today.</div>}
        </div>
      </div>
    </div>
  );
}
