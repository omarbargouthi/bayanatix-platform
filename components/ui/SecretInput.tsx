"use client";

import { useEffect, useState } from "react";

// A write-only password field that can instead point to where the password is kept
// in HashiCorp Vault ("<path>#<field>"). The parent receives either the typed
// password or "ref:vault:<path>#<field>", which the server stores as it is and reads
// from Vault on each use. Empty means "leave unchanged", as for any password field.
// The Vault option only shows when the server has Vault configured.

type VaultInfo = { available: boolean; allowedPaths: string[] };
let vaultInfo: Promise<VaultInfo> | null = null;
function loadVaultInfo(): Promise<VaultInfo> {
  vaultInfo ??= fetch("/api/admin/secrets/vault-ref")
    .then((r) => (r.ok ? r.json() : { available: false, allowedPaths: [] }))
    .catch(() => ({ available: false, allowedPaths: [] }));
  return vaultInfo;
}

const REF = "ref:vault:";

export function SecretInput({
  value, onChange, currentRef, placeholder, inputClassName, compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  /** The saved Vault reference, when the field holds one. */
  currentRef?: string | null;
  placeholder?: string;
  inputClassName?: string;
  compact?: boolean;
}) {
  const [info, setInfo] = useState<VaultInfo | null>(null);
  const [mode, setMode] = useState<"password" | "vault">(currentRef ? "vault" : "password");
  const [path, setPath] = useState(currentRef ?? "");
  const [show, setShow] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | "checking" | null>(null);

  useEffect(() => { void loadVaultInfo().then(setInfo); }, []);
  useEffect(() => { setMode(currentRef ? "vault" : "password"); setPath(currentRef ?? ""); setCheck(null); }, [currentRef]);

  const text = compact ? "text-[11px]" : "text-sm";
  const cls = inputClassName ?? `w-full border border-line rounded-lg px-3 py-2 ${text} text-ink focus:outline-none focus:border-brand-purple`;
  const offerVault = !!info?.available || !!currentRef;

  function switchTo(m: "password" | "vault") {
    setMode(m); setCheck(null);
    onChange(m === "vault" && path.trim() && path.trim() !== (currentRef ?? "") ? REF + path.trim() : "");
  }

  async function runCheck() {
    setCheck("checking");
    const r = await fetch("/api/admin/secrets/vault-ref", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: path.trim() }),
    });
    setCheck(r.ok ? await r.json() : { ok: false, message: "Could not check the reference" });
  }

  return (
    <div className={compact ? "flex-1 min-w-0" : ""}>
      {offerVault && (
        <div className={`flex gap-3 mb-1 ${compact ? "text-[10px]" : "text-[11px]"}`}>
          {(["password", "vault"] as const).map((m) => (
            <button key={m} type="button" onClick={() => switchTo(m)}
              className={mode === m ? "font-semibold text-brand-purple" : "text-muted hover:text-ink"}>
              {m === "password" ? "Password" : "Vault reference"}
            </button>
          ))}
        </div>
      )}
      {mode === "password" ? (
        <div className="relative">
          <input type={show ? "text" : "password"} autoComplete="new-password" className={`${cls} pr-12`}
            value={value.startsWith(REF) ? "" : value} placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)} />
          <button type="button" onClick={() => setShow((v) => !v)}
            className={`absolute right-3 ${compact ? "top-1" : "top-2.5"} text-muted hover:text-ink text-xs`}>{show ? "Hide" : "Show"}</button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input autoComplete="off" spellCheck={false} className={`${cls} font-mono`} value={path}
              placeholder={info?.allowedPaths[0] ? `${info.allowedPaths[0]}finance-db#password` : "secret/bayanis/finance-db#password"}
              onChange={(e) => { setPath(e.target.value); setCheck(null); const p = e.target.value.trim(); onChange(p && p !== (currentRef ?? "") ? REF + p : ""); }} />
            <button type="button" onClick={runCheck} disabled={!path.trim() || check === "checking"}
              className={`shrink-0 px-2 rounded-lg border border-line bg-white ${compact ? "text-[11px]" : "text-xs"} font-semibold text-ink hover:bg-canvas-soft disabled:opacity-40`}>
              {check === "checking" ? "Checking…" : "Check"}
            </button>
          </div>
          <p className={`${compact ? "text-[10px]" : "text-[11px]"} mt-1 ${check && check !== "checking" ? (check.ok ? "text-emerald-700" : "text-red-700") : "text-muted"}`}>
            {check && check !== "checking"
              ? `${check.ok ? "✓" : "✗"} ${check.message}`
              : <>Where the password is kept in Vault: <span className="font-mono">path#field</span>. Bayanis reads it each time it connects and never stores it.</>}
          </p>
        </>
      )}
    </div>
  );
}
