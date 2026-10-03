"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang-context";
import { describeUserAgent } from "@/lib/privacy/user-agent";

type Summary = { enabled: boolean; version: number; activeUsers: number; accepted: number; declined: number; noDecision: number };
type Decision = {
  consentId: number; decidedAt: string; userId: string; userName: string | null; email: string | null;
  version: number; decision: "ACCEPTED" | "DECLINED"; ipAddress: string | null; userAgent: string | null;
};
type Pending = {
  userId: string; userName: string; email: string; role: string; lastLoginAt: string | null;
  lastDecision: "ACCEPTED" | "DECLINED" | null; lastDecisionVersion: number | null; lastDecidedAt: string | null;
};

const fmt = (s: string) => new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Admin > Audit & Logs > Consent: the consent register (lib/privacy/consent-register.ts).
export function ConsentRegisterSection() {
  const { t } = useLang();
  const c = t.consentRegister;
  const [view, setView] = useState<"decisions" | "pending">("decisions");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState("");
  const [decision, setDecision] = useState("");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [versions, setVersions] = useState<number[]>([]);
  const [decisions, setDecisions] = useState<{ rows: Decision[]; total: number } | null>(null);
  const [pending, setPending] = useState<Pending[] | null>(null);

  // Debounce the search box.
  useEffect(() => { const h = setTimeout(() => setQuery(q), 300); return () => clearTimeout(h); }, [q]);
  useEffect(() => { setPage(1); }, [query, version, decision, view]);

  const params = () => {
    const p = new URLSearchParams();
    if (query.trim()) p.set("q", query.trim());
    if (version) p.set("version", version);
    if (decision) p.set("decision", decision);
    return p;
  };

  useEffect(() => {
    const p = params();
    if (view === "pending") {
      p.set("view", "pending");
      fetch(`/api/admin/consent-register?${p}`).then((r) => r.json()).then((d) => { setSummary(d.summary); setPending(d.pending); }).catch(() => {});
    } else {
      p.set("page", String(page));
      fetch(`/api/admin/consent-register?${p}`).then((r) => r.json()).then((d) => {
        setSummary(d.summary); setVersions(d.versions ?? []); setDecisions({ rows: d.rows, total: d.total });
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, query, version, decision, page]);

  const totalPages = decisions ? Math.max(1, Math.ceil(decisions.total / 50)) : 1;
  const pendingCount = summary ? summary.activeUsers - summary.accepted : 0;
  const decisionBadge = (d: "ACCEPTED" | "DECLINED") => (
    <span className={d === "ACCEPTED" ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>{d === "ACCEPTED" ? c.accepted : c.declined}</span>
  );

  return (
    <main className="px-8 py-7 pb-14">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-bold text-ink">{c.title}</h2>
          <p className="text-[13px] text-muted mt-0.5">{c.desc}</p>
        </div>
        <a href={`/api/admin/consent-register/export?${params()}`} className="btn btn-sm shrink-0">{c.export}</a>
      </div>

      {summary && !summary.enabled && (
        <div className="mb-4 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-4 py-2.5">{c.off}</div>
      )}

      {summary && (
        <div className="grid grid-cols-5 gap-3 mb-5">
          {[
            { label: c.currentVersion, value: summary.version, cls: "text-brand-deep" },
            { label: c.activeUsers, value: summary.activeUsers, cls: "text-ink" },
            { label: c.accepted, value: summary.accepted, cls: "text-emerald-700" },
            { label: c.declined, value: summary.declined, cls: "text-red-600" },
            { label: c.noDecision, value: summary.noDecision, cls: "text-amber-700" },
          ].map((k) => (
            <div key={k.label} className="card px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-muted font-bold">{k.label}</div>
              <div className={`text-2xl font-bold mt-1 ${k.cls}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex rounded-md border border-line overflow-hidden">
          {(["decisions", "pending"] as const).map((v) => (
            <button
              key={v} onClick={() => setView(v)}
              className={`px-3.5 py-1.5 text-[13px] font-medium ${view === v ? "bg-brand-purple text-white" : "bg-white text-ink-soft hover:bg-canvas-soft"}`}
            >
              {v === "decisions" ? c.viewDecisions : c.viewPending.replace("{n}", String(pendingCount))}
            </button>
          ))}
        </div>
        <input className="input text-sm w-64" placeholder={c.search} value={q} onChange={(e) => setQ(e.target.value)} />
        {view === "decisions" && (
          <>
            <select className="input text-sm w-44" value={version} onChange={(e) => setVersion(e.target.value)}>
              <option value="">{c.allVersions}</option>
              {versions.map((v) => (
                <option key={v} value={v}>{c.versionN.replace("{n}", String(v))}{summary?.version === v ? ` ${c.currentSuffix}` : ""}</option>
              ))}
            </select>
            <select className="input text-sm w-40" value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="">{c.allDecisions}</option>
              <option value="ACCEPTED">{c.accepted}</option>
              <option value="DECLINED">{c.declined}</option>
            </select>
          </>
        )}
      </div>

      <div className="card overflow-hidden">
        {view === "decisions" ? (
          <table className="w-full">
            <thead className="bg-canvas-soft">
              <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
                <th className="px-5 py-2.5 text-start">{c.colWhen}</th>
                <th className="px-5 py-2.5 text-start">{c.colUser}</th>
                <th className="px-5 py-2.5 text-start">{c.colVersion}</th>
                <th className="px-5 py-2.5 text-start">{c.colDecision}</th>
                <th className="px-5 py-2.5 text-start">{c.colIp}</th>
                <th className="px-5 py-2.5 text-start">{c.colBrowser}</th>
              </tr>
            </thead>
            <tbody>
              {decisions?.rows.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-sm text-muted">{c.emptyDecisions}</td></tr>}
              {decisions?.rows.map((r) => (
                <tr key={r.consentId} className="border-t border-line-soft">
                  <td className="px-5 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">{fmt(r.decidedAt)}</td>
                  <td className="px-5 py-2.5">
                    <div className="text-[13px] text-ink">{r.userName ?? r.userId}</div>
                    {r.email && <div className="text-[11px] text-muted" dir="ltr">{r.email}</div>}
                  </td>
                  <td className="px-5 py-2.5 text-[12px] text-ink-soft">v{r.version}</td>
                  <td className="px-5 py-2.5 text-[12px]">{decisionBadge(r.decision)}</td>
                  <td className="px-5 py-2.5 text-[12px] text-ink-soft font-mono" dir="ltr">{r.ipAddress ?? "—"}</td>
                  <td className="px-5 py-2.5 text-[12px] text-ink-soft" title={r.userAgent ?? ""}>{describeUserAgent(r.userAgent) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full">
            <thead className="bg-canvas-soft">
              <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
                <th className="px-5 py-2.5 text-start">{c.colUser}</th>
                <th className="px-5 py-2.5 text-start">{c.colRole}</th>
                <th className="px-5 py-2.5 text-start">{c.colLastLogin}</th>
                <th className="px-5 py-2.5 text-start">{c.colLatest}</th>
              </tr>
            </thead>
            <tbody>
              {pending?.length === 0 && <tr><td colSpan={4} className="py-12 text-center text-sm text-muted">{c.emptyPending}</td></tr>}
              {pending?.map((r) => (
                <tr key={r.userId} className="border-t border-line-soft">
                  <td className="px-5 py-2.5">
                    <div className="text-[13px] text-ink">{r.userName}</div>
                    <div className="text-[11px] text-muted" dir="ltr">{r.email}</div>
                  </td>
                  <td className="px-5 py-2.5 text-[12px] text-ink-soft">{r.role}</td>
                  <td className="px-5 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">{r.lastLoginAt ? fmt(r.lastLoginAt) : c.never}</td>
                  <td className="px-5 py-2.5 text-[12px]">
                    {r.lastDecision
                      ? <>{decisionBadge(r.lastDecision)} <span className="text-muted">· v{r.lastDecisionVersion} · {r.lastDecidedAt && fmt(r.lastDecidedAt)}</span></>
                      : <span className="text-amber-700">{c.noDecision}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {view === "decisions" && totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line-soft">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-sm">{t.auditLog.prev}</button>
            <span className="text-[12px] text-muted">{t.auditLog.pageOf.replace("{page}", String(page)).replace("{total}", String(totalPages))}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn btn-sm">{t.auditLog.next}</button>
          </div>
        )}
      </div>
    </main>
  );
}
