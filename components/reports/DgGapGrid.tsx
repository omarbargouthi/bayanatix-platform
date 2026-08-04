"use client";

import Link from "next/link";
import type { DgGapRow } from "@/lib/queries/reports";
import { PaginationBar } from "./DqDrillDownGrid";
import { useLang } from "@/lib/lang-context";

function YesNo({ ok }: { ok: boolean }) {
  const { t } = useLang();
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
      {ok ? t.reports.common.yes : t.reports.common.no}
    </span>
  );
}

export function DgGapGrid({
  rows, total, page, pageSize, onPageChange,
}: {
  rows: DgGapRow[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useLang();
  const rc = t.reports.common;
  const rt = t.reports.dg;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (rows.length === 0) {
    return <div className="text-sm text-muted text-center py-10">{rt.empty}</div>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
              <th className="py-2 pr-3">{rc.colTable}</th>
              <th className="py-2 pr-3">{rc.colSource}</th>
              <th className="py-2 pr-3">{rc.colDomain}</th>
              <th className="py-2 pr-3">{rc.colOwner}</th>
              <th className="py-2 pr-3">{rc.colSteward}</th>
              <th className="py-2 pr-3">{rc.colCertified}</th>
              <th className="py-2 pr-3">{rt.colMissingDesc}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entityId} className="border-b border-line-soft hover:bg-canvas">
                <td className="py-2 pr-3">
                  <Link href={`/catalog/${r.schemaId}/tables/${r.entityId}`} className="text-brand-purple hover:underline font-medium">
                    {r.entityName}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-ink-soft">{r.sourceName}</td>
                <td className="py-2 pr-3 text-ink-soft">{r.domainName}</td>
                <td className="py-2 pr-3"><YesNo ok={r.hasOwner} /></td>
                <td className="py-2 pr-3"><YesNo ok={r.hasSteward} /></td>
                <td className="py-2 pr-3"><YesNo ok={r.isCertified} /></td>
                <td className="py-2 pr-3 text-ink-soft">{r.missingDescCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationBar page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}
