"use client";

import { useState, useCallback } from "react";
import type { AuditSearchEntry } from "@/lib/audit";
import type { AdminUser } from "@/lib/types";
import { useLang } from "@/lib/lang-context";

const ASSET_TYPE_CODES = ["DATA_SOURCES", "DATA_SCHEMAS", "DATA_ENTITIES", "DATA_ATTRIBUTES", "BUSINESS_GLOSSARIES"] as const;

function fmt(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function initials(name: string | null, id: string) {
  if (id === "SYSTEM") return "SY";
  if (!name) return id.slice(0, 2).toUpperCase();
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export function AuditLogClient({ users }: { users: AdminUser[] }) {
  const { t } = useLang();
  const a = t.auditLog;
  const [assetType, setAssetType] = useState("");
  const [userId,    setUserId]    = useState("");
  const [from,      setFrom]      = useState("");
  const [to,        setTo]        = useState("");
  const [q,         setQ]         = useState("");
  const [page,      setPage]      = useState(1);

  const [entries,   setEntries]   = useState<AuditSearchEntry[]>([]);
  const [total,     setTotal]     = useState<number | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [searched,  setSearched]  = useState(false);

  const search = useCallback(async (pg = 1) => {
    setLoading(true);
    setError(null);
    setPage(pg);
    try {
      const sp = new URLSearchParams();
      if (assetType) sp.set("assetType", assetType);
      if (userId)    sp.set("userId",    userId);
      if (from)      sp.set("from",      from);
      if (to)        sp.set("to",        `${to}T23:59:59`);
      if (q)         sp.set("q",         q);
      sp.set("page", String(pg));
      const res = await fetch(`/api/admin/audit-log?${sp}`);
      if (!res.ok) throw new Error(a.loadFailed);
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
      setSearched(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [assetType, userId, from, to, q, a.loadFailed]);

  const PAGE_SIZE = 50;
  const totalPages = total != null ? Math.ceil(total / PAGE_SIZE) : 1;

  return (
    <main className="px-8 py-7 pb-14">
      {/* Filter bar */}
      <div className="card p-5 mb-6">
        <div className="grid grid-cols-[1fr_1fr_auto_auto_1fr] gap-3 items-end">
          <div>
            <label className="field-label">{a.assetType}</label>
            <select value={assetType} onChange={(e) => setAssetType(e.target.value)} className="input-field">
              <option value="">{a.allAssetTypes}</option>
              {ASSET_TYPE_CODES.map((code) => (
                <option key={code} value={code}>{a.assetTypesPlural[code]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">{a.user}</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="input-field">
              <option value="">{a.allUsers}</option>
              {users.map((u) => (
                <option key={u.userId} value={u.userId}>{u.fullName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">{a.from}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="field-label">{a.to}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="field-label">{a.searchLabel}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search(1)}
                placeholder={a.searchPlaceholder}
                className="input-field flex-1"
              />
              <button onClick={() => search(1)} disabled={loading} className="btn btn-primary shrink-0">
                {loading ? "…" : a.searchBtn}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</div>
      )}

      {/* Results */}
      {!searched && !loading && (
        <div className="card py-16 text-center text-muted text-sm">
          {a.emptyPrompt}
        </div>
      )}

      {searched && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted">
              {total != null ? <><strong className="text-ink">{total.toLocaleString()}</strong> {a.eventsFound}</> : ""}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => search(page - 1)}
                  className="btn btn-sm"
                >{a.prev}</button>
                <span className="text-sm text-muted">{a.pageOf.replace("{page}", String(page)).replace("{total}", String(totalPages))}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => search(page + 1)}
                  className="btn btn-sm"
                >{a.next}</button>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[180px_180px_160px_1fr] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
              <div className="min-w-0 truncate">{a.colTimestamp}</div>
              <div className="min-w-0 truncate">{a.colUser}</div>
              <div className="min-w-0 truncate">{a.colAsset}</div>
              <div className="min-w-0 truncate">{a.colChanges}</div>
            </div>

            {entries.length === 0 && (
              <div className="py-12 text-center text-muted text-sm">{a.noMatches}</div>
            )}

            {entries.map((e) => (
              <div key={e.auditId} className="grid grid-cols-[180px_180px_160px_1fr] gap-3 px-5 py-4 border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors items-start">
                {/* Timestamp */}
                <div className="min-w-0 text-[12px] text-ink-soft truncate">{fmt(e.timestamp)}</div>

                {/* User */}
                <div className="min-w-0 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-brand-purple/15 text-brand-purple text-[10px] font-bold grid place-items-center shrink-0">
                    {initials(e.userName, e.userId)}
                  </span>
                  <span className="text-sm text-ink truncate">{e.userId === "SYSTEM" ? a.systemActor : e.userName ?? e.userId}</span>
                </div>

                {/* Asset */}
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-brand-purple truncate">
                    {(a.assetTypes as Record<string, string>)[e.assetType] ?? e.assetType}
                  </div>
                  <div className="text-[11px] text-muted font-mono truncate">#{e.assetId}</div>
                </div>

                {/* Changes */}
                <div className="min-w-0 space-y-1.5">
                  {e.changes.length === 0 && (
                    <span className="text-[12px] text-muted italic">{a.noFieldDetails}</span>
                  )}
                  {e.changes.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px]">
                      <span className="font-semibold text-ink-soft w-36 shrink-0 pt-0.5">
                        {(a.fields as Record<string, string>)[c.field] ?? c.field}
                      </span>
                      <div className="flex items-start gap-1.5 min-w-0">
                        <span className="line-through text-red-500 bg-red-50 px-1.5 py-0.5 rounded max-w-[200px] truncate">
                          {c.from ?? <em className="not-italic text-muted">{a.emptyValue}</em>}
                        </span>
                        <span className="text-muted shrink-0">→</span>
                        <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded max-w-[200px] truncate">
                          {c.to ?? <em className="not-italic text-muted">{a.emptyValue}</em>}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
