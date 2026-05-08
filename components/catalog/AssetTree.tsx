"use client";

import { useState } from "react";
import Link from "next/link";
import { IconDB, IconChevron } from "@/components/layout/icons";
import type { DataSource, DataSchema } from "@/lib/types";

export function AssetTree({ sources }: { sources: (DataSource & { schemas: DataSchema[] })[] }) {
  return (
    <div className="text-sm">
      {sources.map((src, i) => (
        <SourceRow key={src.dataSourceId} src={src} defaultOpen={i === 0} />
      ))}
    </div>
  );
}

function SourceRow({ src, defaultOpen }: { src: DataSource & { schemas: DataSchema[] }; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const tableTotal = src.schemas.reduce((s, sc) => s + (sc.tableCount ?? 0), 0);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-canvas transition-colors"
      >
        <IconChevron
          className={"w-3 h-3 text-muted transition-transform " + (open ? "" : "-rotate-90")}
        />
        <svg className="w-[18px] h-[18px] text-brand-navy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
          <path d="M3 7l9 4 9-4M12 11v10" />
        </svg>
        <span className="flex-1 font-semibold text-ink text-left truncate">{src.sourceName}</span>
        <span className="text-xs text-muted">
          {src.schemas.length} schemas · {tableTotal.toLocaleString()} tables
        </span>
      </button>
      {open && src.schemas.length > 0 && (
        <div className="mt-0.5">
          {src.schemas.map((sc) => (
            <Link
              key={sc.schemaId}
              href={`/catalog/${sc.schemaId}`}
              className="flex items-center gap-2.5 pl-9 pr-3 py-2 rounded-md hover:bg-canvas transition-colors"
            >
              <IconDB className="w-[18px] h-[18px] text-brand-navy" />
              <span className="flex-1 truncate">{sc.schemaName}</span>
              <span className="text-xs text-muted">
                {sc.tableCount ?? 0} tables · {sc.viewCount ?? 0} views
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
