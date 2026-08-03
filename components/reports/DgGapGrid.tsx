"use client";

import Link from "next/link";
import type { DgGapRow } from "@/lib/queries/reports";
import { PaginationBar } from "./DqDrillDownGrid";

function YesNo({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
      {ok ? "Yes" : "No"}
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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (rows.length === 0) {
    return <div className="text-sm text-muted text-center py-10">No governance gaps in scope — every table has an owner, steward, certification, and described columns.</div>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
              <th className="py-2 pr-3">Table</th>
              <th className="py-2 pr-3">Source</th>
              <th className="py-2 pr-3">Domain</th>
              <th className="py-2 pr-3">Owner</th>
              <th className="py-2 pr-3">Steward</th>
              <th className="py-2 pr-3">Certified</th>
              <th className="py-2 pr-3">Missing Descriptions</th>
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
