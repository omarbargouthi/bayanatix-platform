"use client";

import Link from "next/link";
import type { DqDrillDownRow } from "@/lib/queries/reports";

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  WARNING: "bg-amber-100 text-amber-700",
  INFO: "bg-blue-100 text-blue-700",
  UNSPECIFIED: "bg-gray-100 text-gray-600",
};

const STATUS_COLORS: Record<string, string> = {
  FAILED: "bg-red-100 text-red-700",
  ERROR: "bg-gray-200 text-gray-600",
};

export function DqDrillDownGrid({
  rows, total, page, pageSize, onPageChange,
}: {
  rows: DqDrillDownRow[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (rows.length === 0) {
    return <div className="text-sm text-muted text-center py-10">No open DQ issues in scope — nothing to drill into.</div>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
              <th className="py-2 pr-3">Rule</th>
              <th className="py-2 pr-3">Dimension</th>
              <th className="py-2 pr-3">Severity</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Table</th>
              <th className="py-2 pr-3">Source</th>
              <th className="py-2 pr-3">Domain</th>
              <th className="py-2 pr-3">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.resultId} className="border-b border-line-soft hover:bg-canvas">
                <td className="py-2 pr-3 font-medium text-ink">{r.ruleName}</td>
                <td className="py-2 pr-3">{r.dimensionName}</td>
                <td className="py-2 pr-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${SEVERITY_COLORS[r.severity] ?? SEVERITY_COLORS.UNSPECIFIED}`}>
                    {r.severity}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[r.statusCode] ?? "bg-gray-100 text-gray-600"}`}>
                    {r.statusCode}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <Link href={`/catalog/${r.schemaId}/tables/${r.entityId}`} className="text-brand-purple hover:underline">
                    {r.entityName}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-ink-soft">{r.sourceName}</td>
                <td className="py-2 pr-3 text-ink-soft">{r.domainName}</td>
                <td className="py-2 pr-3 text-ink-soft">{r.ageDays}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationBar page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}

export function PaginationBar({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 mt-3 text-sm">
      <button
        className="px-2 py-1 rounded border border-line disabled:opacity-40"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Prev
      </button>
      <span className="text-muted text-xs">Page {page} of {totalPages}</span>
      <button
        className="px-2 py-1 rounded border border-line disabled:opacity-40"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
