"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang } from "@/lib/lang-context";
import { UserSearchPicker } from "@/components/catalog/UserSearchPicker";
import type { DomainCode } from "@/lib/can";

type Grant = { userId: string; fullName: string | null; email: string | null };
type UserResult = { userId: string; fullName: string | null; email: string };

// Self-service "grant read-only access to my domain" panel — only renders
// once its own fetch confirms the current user manages `domain` (a domain-
// write role holder, or ADMIN); silently renders nothing otherwise, so it's
// safe to drop into every domain page unconditionally.
export function DomainAccessPanel({ domain, domainLabel }: { domain: DomainCode; domainLabel: string }) {
  const { t } = useLang();
  const c = t.domainAccess;
  const [grants,  setGrants]  = useState<Grant[] | null>(null); // null = not yet loaded / not authorized
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/domain-access");
    if (!r.ok) { setGrants(null); return; }
    const data: { domains: { domain: DomainCode; grants: Grant[] }[] } = await r.json();
    const mine = data.domains.find((d) => d.domain === domain);
    setGrants(mine ? mine.grants : null);
  }, [domain]);

  useEffect(() => { load(); }, [load]);

  async function grant(user: UserResult) {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/domain-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, userId: user.userId }),
      });
      if (!r.ok) { setError(c.grantFailed); return; }
      await load();
    } finally { setBusy(false); }
  }

  async function revoke(userId: string, name: string) {
    if (!confirm(c.revokeConfirm.replace("{name}", name).replace("{domain}", domainLabel))) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/domain-access", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, userId }),
      });
      if (!r.ok) { setError(c.grantFailed); return; }
      await load();
    } finally { setBusy(false); }
  }

  if (grants === null) return null;

  return (
    <div className="card p-5 space-y-3">
      <div>
        <h3 className="font-bold text-sm">{c.manageAccessTitle}</h3>
        <p className="text-[12px] text-muted mt-0.5">{c.manageAccessDesc}</p>
      </div>

      <UserSearchPicker
        onSelect={grant}
        excludeIds={grants.map((g) => g.userId)}
        placeholder={c.addUserPlaceholder}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {grants.length === 0 ? (
        <p className="text-[12px] text-muted italic">{c.noReadGrantsYet}</p>
      ) : (
        <div className="space-y-1.5">
          {grants.map((g) => (
            <div key={g.userId} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-canvas-soft rounded-lg">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-ink truncate">{g.fullName ?? g.userId}</div>
                {g.email && <div className="text-[11px] text-muted truncate">{g.email}</div>}
              </div>
              <button
                onClick={() => revoke(g.userId, g.fullName ?? g.userId)}
                disabled={busy}
                className="text-[11px] text-red-500 hover:text-red-700 shrink-0"
              >
                {t.common.remove}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
