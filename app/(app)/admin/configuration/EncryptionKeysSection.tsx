"use client";

import { useState, useEffect } from "react";

type State = "current" | "older-key" | "plain" | "unreadable";
type Store = { code: string; name: string; total: number; counts: Record<State, number>; byKey: Record<string, number>; unreadable: string[] };
type Status = {
  provider: string; currentKeyId: string; previousKeyIds: string[]; unusedPreviousKeyIds: string[];
  stores: Store[]; lastReseal: { at: string; keyId: string; byUserId: string } | null;
};
type Result = { keyId: string; resealed: number; alreadyCurrent: number; failed: { store: string; label: string; reason: string }[] };

const PROVIDER_LABEL: Record<string, string> = { local: "Local key (from the server environment)" };

export function EncryptionKeysSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function load() {
    const r = await fetch("/api/admin/secrets");
    const j = await r.json();
    if (!r.ok) { setError(j.error ?? "Could not read the key status"); return; }
    setError(null);
    setStatus(j);
  }
  useEffect(() => { void load(); }, []);

  async function reseal() {
    setRunning(true); setResult(null);
    try {
      const r = await fetch("/api/admin/secrets", { method: "POST" });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Re-encryption failed"); return; }
      setResult(j.result); setStatus(j.status);
    } finally { setRunning(false); }
  }

  if (error && !status) return <div className="text-sm text-red-700">{error}</div>;
  if (!status) return <div className="text-sm text-muted">Loading…</div>;

  const pending = status.stores.reduce((n, s) => n + s.counts["older-key"] + s.counts.plain, 0);
  const unreadable = status.stores.reduce((n, s) => n + s.counts.unreadable, 0);

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-ink">Encryption Keys</h2>
        <p className="text-xs text-muted mt-1">
          Data source passwords, AI provider keys, LDAP bind passwords and the SSO client secret are stored
          encrypted (AES-256-GCM). The key is held in the server environment, never in the database; each stored
          value records which key encrypted it, so the key can be replaced without re-entering any password.
        </p>
      </div>

      <div className="bg-white border border-line rounded-xl p-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
        <div className="text-muted">Provider</div>
        <div className="text-ink">{PROVIDER_LABEL[status.provider] ?? status.provider}</div>
        <div className="text-muted">Current key</div>
        <div className="font-mono text-ink">{status.currentKeyId}</div>
        <div className="text-muted">Previous keys</div>
        <div className="text-ink">
          {status.previousKeyIds.length === 0 ? "None" : status.previousKeyIds.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 me-3">
              <span className="font-mono">{k}</span>
              {status.unusedPreviousKeyIds.includes(k)
                ? <span className="text-[11px] text-emerald-700">no longer used — can be removed</span>
                : <span className="text-[11px] text-amber-700">still in use</span>}
            </span>
          ))}
        </div>
        <div className="text-muted">Last re-encryption</div>
        <div className="text-ink">
          {status.lastReseal ? <>{new Date(status.lastReseal.at).toLocaleString()} · key <span className="font-mono">{status.lastReseal.keyId}</span> · {status.lastReseal.byUserId}</> : "Never"}
        </div>
      </div>

      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-canvas-soft text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="text-start px-4 py-2 font-semibold">Stored secrets</th>
              <th className="text-end px-3 py-2 font-semibold">Total</th>
              <th className="text-end px-3 py-2 font-semibold">Current key</th>
              <th className="text-end px-3 py-2 font-semibold">Older key</th>
              <th className="text-end px-3 py-2 font-semibold">Not encrypted</th>
              <th className="text-end px-4 py-2 font-semibold">Unreadable</th>
            </tr>
          </thead>
          <tbody>
            {status.stores.map((s) => (
              <tr key={s.code} className="border-t border-line">
                <td className="px-4 py-2 text-ink">{s.name}</td>
                <td className="px-3 py-2 text-end tabular-nums">{s.total}</td>
                <td className="px-3 py-2 text-end tabular-nums">{s.counts.current}</td>
                <td className={`px-3 py-2 text-end tabular-nums ${s.counts["older-key"] ? "text-amber-700 font-semibold" : ""}`}>{s.counts["older-key"]}</td>
                <td className={`px-3 py-2 text-end tabular-nums ${s.counts.plain ? "text-amber-700 font-semibold" : ""}`}>{s.counts.plain}</td>
                <td className={`px-4 py-2 text-end tabular-nums ${s.counts.unreadable ? "text-red-700 font-semibold" : ""}`}>{s.counts.unreadable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unreadable > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-[13px] text-red-800">
          {unreadable} stored secret(s) cannot be opened with any configured key:{" "}
          {status.stores.flatMap((s) => s.unreadable).join(", ")}. Add the key they were encrypted with to
          LLM_SECRETS_PREVIOUS_KEYS and restart, or enter these passwords again.
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={reseal} disabled={running || pending === 0}
          className="px-4 py-2 rounded-lg bg-brand-purple text-white text-sm font-semibold disabled:opacity-40">
          {running ? "Re-encrypting…" : "Re-encrypt with the current key"}
        </button>
        <span className="text-xs text-muted">
          {pending === 0 ? "Every readable secret already uses the current key." : `${pending} secret(s) to re-encrypt.`}
        </span>
      </div>

      {result && (
        <div className={`rounded-xl p-4 text-[13px] border ${result.failed.length ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}>
          {result.resealed} re-encrypted with key <span className="font-mono">{result.keyId}</span>, {result.alreadyCurrent} already current
          {result.failed.length > 0 && <>, {result.failed.length} failed:
            <ul className="mt-1 list-disc ms-5">{result.failed.map((f) => <li key={f.store + f.label}>{f.label} ({f.store}): {f.reason}</li>)}</ul>
          </>}
        </div>
      )}

      <div className="bg-canvas-soft border border-line rounded-xl p-5 text-[13px] text-ink">
        <h3 className="font-semibold mb-2">How to rotate the key</h3>
        <ol className="list-decimal ms-5 space-y-1.5">
          <li>Generate a new key: <code className="font-mono text-[12px]">openssl rand -hex 32</code></li>
          <li>In the server environment, set it as <code className="font-mono text-[12px]">LLM_SECRETS_MASTER_KEY</code> and move the old key to <code className="font-mono text-[12px]">LLM_SECRETS_PREVIOUS_KEYS</code> (comma-separated when there are several). Restart Bayanis.</li>
          <li>Click <strong>Re-encrypt with the current key</strong> above, or run <code className="font-mono text-[12px]">node scripts/reseal-secrets.mjs</code> on the server.</li>
          <li>When the old key shows <em>no longer used</em>, remove it from <code className="font-mono text-[12px]">LLM_SECRETS_PREVIOUS_KEYS</code> and restart.</li>
        </ol>
        <p className="text-xs text-muted mt-3">
          Keep the old key until step 4: database backups taken before the rotation can only be read with it.
          Every re-encryption is recorded in the audit log.
        </p>
      </div>
    </div>
  );
}
