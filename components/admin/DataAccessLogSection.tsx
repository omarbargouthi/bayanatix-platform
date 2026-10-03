"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";

type Row = {
  accessId: number; accessedAt: string; userName: string | null; userId: string; entityId: number; entityName: string | null;
  schemaId: number | null; piColumnCount: number; clearText: boolean; clearTextBasis: string | null; rowCount: number | null;
};

// Admin > Audit & Logs > Data Access: who looked at live sample data, and whether
// personal-data columns were masked or shown in clear text (lib/privacy/pi-housekeeping.ts).
export function DataAccessLogSection() {
  const { t } = useLang();
  const p = t.privacy;
  const [clearOnly, setClearOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: Row[]; total: number } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/data-access-log?page=${page}${clearOnly ? "&clearOnly=1" : ""}`).then((r) => r.json()).then(setData).catch(() => {});
  }, [clearOnly, page]);
  useEffect(() => { setPage(1); }, [clearOnly]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;
  const fmt = (s: string) => new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <main className="px-8 py-7 pb-14">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-bold text-ink">{p.accessTitle}</h2>
          <p className="text-[13px] text-muted mt-0.5">{p.accessDesc}</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-soft cursor-pointer shrink-0">
          <input type="checkbox" className="accent-brand-purple" checked={clearOnly} onChange={(e) => setClearOnly(e.target.checked)} />
          {p.onlyClear}
        </label>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-canvas-soft">
            <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
              <th className="px-5 py-2.5 text-start">{p.colWhen}</th>
              <th className="px-5 py-2.5 text-start">{p.colUser}</th>
              <th className="px-5 py-2.5 text-start">{p.colAsset}</th>
              <th className="px-5 py-2.5 text-start">{p.colRows}</th>
              <th className="px-5 py-2.5 text-start">{p.colPersonal}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-sm text-muted">{p.empty}</td></tr>}
            {data?.rows.map((r) => (
              <tr key={r.accessId} className="border-t border-line-soft">
                <td className="px-5 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">{fmt(r.accessedAt)}</td>
                <td className="px-5 py-2.5 text-[13px] text-ink">{r.userName ?? r.userId}</td>
                <td className="px-5 py-2.5 text-[13px]">
                  {r.schemaId
                    ? <Link href={`/catalog/${r.schemaId}/tables/${r.entityId}?tab=Sample%20Data`} className="text-brand-purple hover:underline" dir="auto">{r.entityName ?? `#${r.entityId}`}</Link>
                    : <span dir="auto">{r.entityName ?? `#${r.entityId}`}</span>}
                </td>
                <td className="px-5 py-2.5 text-[12px] text-ink-soft">{r.rowCount ?? "—"}</td>
                <td className="px-5 py-2.5 text-[12px]">
                  {r.piColumnCount === 0 ? <span className="text-muted">{p.none}</span>
                    : r.clearText
                      ? <span className="font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">{r.clearTextBasis === "ADMIN" ? p.clearAdmin : p.clearGrant} · {r.piColumnCount}</span>
                      : <span className="text-emerald-700">{p.masked} · {r.piColumnCount}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
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
