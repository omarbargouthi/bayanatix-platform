"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PaginationBar } from "./DqDrillDownGrid";

export type GridColumn<T> = {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
};

export function DrillDownGrid<T extends Record<string, unknown>>({
  columns, rows, total, page, pageSize, onPageChange, rowKey, emptyMessage, linkHref,
}: {
  columns: GridColumn<T>[];
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  rowKey: (row: T) => string | number;
  emptyMessage: string;
  linkHref?: (row: T) => string | null;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (rows.length === 0) {
    return <div className="text-sm text-muted text-center py-10">{emptyMessage}</div>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
              {columns.map((c) => <th key={c.key} className="py-2 pr-3">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = linkHref?.(row) ?? null;
              return (
                <tr key={rowKey(row)} className="border-b border-line-soft hover:bg-canvas">
                  {columns.map((c, i) => {
                    const content = c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "");
                    return (
                      <td key={c.key} className={`py-2 pr-3 ${c.className ?? ""}`}>
                        {i === 0 && href ? (
                          <Link href={href} className="text-brand-purple hover:underline font-medium">{content}</Link>
                        ) : content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginationBar page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}
