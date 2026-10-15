"use client";

import { useState, useEffect } from "react";

type State = "current" | "older-key" | "plain" | "unreadable";
type Store = { code: string; name: string; total: number; counts: Record<State, number>; byKey: Record<string, number>; unreadable: string[] };
type Status = {
  provider: string; location: string | null; providerError: string | null; canRotate: boolean;
  currentKeyId: string; previousKeyIds: string[]; unusedPreviousKeyIds: string[]; otherProvider: number;
  stores: Store[]; lastReseal: { at: string; keyId: string; byUserId: string } | null;
};
type Result = { keyId: string; resealed: number; alreadyCurrent: number; failed: { store: string; label: string; reason: string }[] };
type Test = { ok: boolean; message: string; ms: number };

const PROVIDER_LABEL: Record<string, string> = {
  local: "Local key (from the server environment)",
  "vault-transit": "HashiCorp Vault Transit",
};

const code = "font-mono text-[12px]";

export function EncryptionKeysSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"reseal" | "rotate" | "test" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/admin/secrets");
    const j = await r.json();
    if (!r.ok) { setError(j.error ?? "Could not read the key status"); return; }
    setError(null);
    setStatus(j);
  }
  useEffect(() => { void load(); }, []);

  async function act(action: "reseal" | "rotate" | "test") {
    setBusy(action); setError(null); setNotice(null);
    if (action !== "test") setResult(null);
    try {
      const r = await fetch("/api/admin/secrets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "The action failed"); return; }
      if (j.status) setStatus(j.status);
      if (j.result) setResult(j.result);
      if (j.test) setTest(j.test);
      if (j.rotated) setNotice(`Vault created key version ${j.rotated}. Re-encrypt to move the stored secrets onto it.`);
    } finally { setBusy(null); }
  }

  if (error && !status) return <div className="text-sm text-red-700">{error}</div>;
  if (!status) return <div className="text-sm text-muted">Loading…</div>;

  const vault = status.provider === "vault-transit";
  const pending = status.stores.reduce((n, s) => n + s.counts["older-key"] + s.counts.plain, 0);
  const unreadable = status.stores.reduce((n, s) => n + s.counts.unreadable, 0);
  const moving = status.otherProvider > 0;

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-ink">Encryption Keys</h2>
        <p className="text-xs text-muted mt-1">
          Data source passwords, AI provider keys, LDAP bind passwords and the SSO client secret are stored
          encrypted. The key is never stored in the database: it is held in the server environment, or in your
          HashiCorp Vault, which then does the encryption itself. Each stored value records which key encrypted it,
          so the key can be replaced, or the secrets moved to Vault, without re-entering any password.
        </p>
      </div>

      {status.providerError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-[13px] text-red-800">
          {PROVIDER_LABEL[status.provider] ?? status.provider} cannot be used: {status.providerError}
        </div>
      )}

      <div className="bg-white border border-line rounded-xl p-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
        <div className="text-muted">Provider</div>
        <div className="text-ink">{PROVIDER_LABEL[status.provider] ?? status.provider}</div>
        {status.location && <>
          <div className="text-muted">Vault</div>
          <div className="font-mono text-ink">{status.location}</div>
        </>}
        <div className="text-muted">Current key</div>
        <div className="font-mono text-ink">{status.currentKeyId || "—"}</div>
        <div className="text-muted">{vault ? "Older key versions" : "Previous keys"}</div>
        <div className="text-ink">
          {status.previousKeyIds.length === 0 ? "None" : status.previousKeyIds.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 me-3">
              <span className="font-mono">{k}</span>
              {status.unusedPreviousKeyIds.includes(k)
                ? <span className="text-[11px] text-emerald-700">no longer used</span>
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
              <th className="text-end px-3 py-2 font-semibold">{moving ? "Older key or other provider" : "Older key"}</th>
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
          {status.stores.flatMap((s) => s.unreadable).join(", ")}.{" "}
          {vault
            ? "Check that Vault is reachable, that Bayanis's policy allows decrypting with that key, and that the key version has not been retired (min_decryption_version)."
            : "Add the key they were encrypted with to LLM_SECRETS_PREVIOUS_KEYS and restart, or enter these passwords again."}
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-[13px] text-red-800">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => act("reseal")} disabled={busy !== null || pending === 0 || !!status.providerError}
          className="px-4 py-2 rounded-lg bg-brand-purple text-white text-sm font-semibold disabled:opacity-40">
          {busy === "reseal" ? "Re-encrypting…" : moving ? `Move ${status.otherProvider} secret(s) to ${PROVIDER_LABEL[status.provider] ?? status.provider}` : "Re-encrypt with the current key"}
        </button>
        {status.canRotate && (
          <button onClick={() => act("rotate")} disabled={busy !== null || !!status.providerError}
            className="px-4 py-2 rounded-lg border border-line bg-white text-ink text-sm font-semibold hover:bg-canvas-soft disabled:opacity-40">
            {busy === "rotate" ? "Rotating…" : "Rotate key in Vault"}
          </button>
        )}
        <button onClick={() => act("test")} disabled={busy !== null}
          className="px-4 py-2 rounded-lg border border-line bg-white text-ink text-sm font-semibold hover:bg-canvas-soft disabled:opacity-40">
          {busy === "test" ? "Testing…" : "Test"}
        </button>
        <span className="text-xs text-muted">
          {pending === 0 ? "Every readable secret already uses the current key." : `${pending} secret(s) to re-encrypt.`}
        </span>
      </div>

      {test && (
        <div className={`rounded-xl p-3 text-[13px] border ${test.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-red-50 border-red-200 text-red-800"}`}>
          {test.ok ? "✓" : "✗"} {test.message} ({test.ms} ms)
        </div>
      )}
      {notice && <div className="rounded-xl p-3 text-[13px] border bg-emerald-50 border-emerald-200 text-emerald-900">{notice}</div>}

      {result && (
        <div className={`rounded-xl p-4 text-[13px] border ${result.failed.length ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}>
          {result.resealed} re-encrypted with key <span className="font-mono">{result.keyId}</span>, {result.alreadyCurrent} already current
          {result.failed.length > 0 && <>, {result.failed.length} failed:
            <ul className="mt-1 list-disc ms-5">{result.failed.map((f) => <li key={f.store + f.label}>{f.label} ({f.store}): {f.reason}</li>)}</ul>
          </>}
        </div>
      )}

      <div className="bg-canvas-soft border border-line rounded-xl p-5 text-[13px] text-ink">
        {vault ? <>
          <h3 className="font-semibold mb-2">How to rotate the key</h3>
          <ol className="list-decimal ms-5 space-y-1.5">
            <li>Click <strong>Rotate key in Vault</strong>, or rotate it in Vault: <code className={code}>vault write -f transit/keys/&lt;key&gt;/rotate</code></li>
            <li>Click <strong>Re-encrypt with the current key</strong>. Vault re-encrypts each value itself (rewrap); the passwords never reach Bayanis.</li>
            <li>When an older version shows <em>no longer used</em>, your Vault administrator can retire it by raising the key&apos;s <code className={code}>min_decryption_version</code>.</li>
          </ol>
        </> : <>
          <h3 className="font-semibold mb-2">How to rotate the key</h3>
          <ol className="list-decimal ms-5 space-y-1.5">
            <li>Generate a new key: <code className={code}>openssl rand -hex 32</code></li>
            <li>In the server environment, set it as <code className={code}>LLM_SECRETS_MASTER_KEY</code> and move the old key to <code className={code}>LLM_SECRETS_PREVIOUS_KEYS</code> (comma-separated when there are several). Restart Bayanis.</li>
            <li>Click <strong>Re-encrypt with the current key</strong> above, or run <code className={code}>node scripts/reseal-secrets.mjs</code> on the server.</li>
            <li>When the old key shows <em>no longer used</em>, remove it from <code className={code}>LLM_SECRETS_PREVIOUS_KEYS</code> and restart.</li>
          </ol>
          <h3 className="font-semibold mt-4 mb-2">Keeping the key in HashiCorp Vault</h3>
          <ol className="list-decimal ms-5 space-y-1.5">
            <li>In Vault, create a Transit key for Bayanis and a policy allowing encrypt, decrypt, rewrap and reading the key on it.</li>
            <li>In the server environment, set <code className={code}>SECRETS_PROVIDER=vault-transit</code>, <code className={code}>VAULT_ADDR</code>, the key name and how Bayanis signs in (token, AppRole or Kubernetes). Keep <code className={code}>LLM_SECRETS_MASTER_KEY</code> for now. Restart Bayanis.</li>
            <li>Click <strong>Test</strong>, then <strong>Move … to HashiCorp Vault Transit</strong>.</li>
            <li>When no stored secret uses the local key any more, remove <code className={code}>LLM_SECRETS_MASTER_KEY</code>.</li>
          </ol>
        </>}
        <p className="text-xs text-muted mt-3">
          Keep an old key until nothing uses it: database backups taken before a rotation can only be read with it.
          Every re-encryption and rotation is recorded in the audit log.
        </p>
      </div>
    </div>
  );
}
