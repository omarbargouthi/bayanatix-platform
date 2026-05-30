"use client";

import { useState } from "react";
import Link from "next/link";
import { IconDB, IconChevron } from "@/components/layout/icons";
import type { DataSource, DataSchema } from "@/lib/types";
import { DataSourceEditModal } from "./DataSourceEditModal";
import { useLang } from "@/lib/lang-context";

export function AssetTree({
  sources,
  canEdit,
}: {
  sources:  (DataSource & { schemas: DataSchema[] })[];
  canEdit?: boolean;
}) {
  return (
    <div className="text-sm">
      {sources.map((src, i) => (
        <SourceRow key={src.dataSourceId} src={src} defaultOpen={i === 0} canEdit={!!canEdit} />
      ))}
    </div>
  );
}

function SourceRow({
  src,
  defaultOpen,
  canEdit,
}: {
  src: DataSource & { schemas: DataSchema[] };
  defaultOpen?: boolean;
  canEdit: boolean;
}) {
  const { isRtl } = useLang();
  const [open,       setOpen]       = useState(!!defaultOpen);
  const [editing,    setEditing]    = useState(false);
  const tableTotal = src.schemas.reduce((s, sc) => s + (sc.tableCount ?? 0), 0);

  return (
    <div>
      <div className="flex items-center gap-1 group">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-canvas transition-colors"
        >
          <IconChevron
            className={"w-3 h-3 text-muted transition-transform " + (open ? "" : isRtl ? "rotate-90" : "-rotate-90")}
          />
          <svg className="w-[18px] h-[18px] text-brand-navy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
            <path d="M3 7l9 4 9-4M12 11v10" />
          </svg>
          <span className="flex-1 font-semibold text-ink truncate">{src.sourceName}</span>
          <span className="text-xs text-muted">
            {src.schemas.length} schemas · {tableTotal.toLocaleString()} tables
          </span>
        </button>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 mr-2 w-6 h-6 grid place-items-center rounded hover:bg-brand-purple/10 text-muted hover:text-brand-purple transition-all"
            title="Edit data source"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
      </div>

      {open && src.schemas.length > 0 && (
        <div className="mt-0.5">
          {src.schemas.map((sc) => (
            <Link
              key={sc.schemaId}
              href={`/catalog/${sc.schemaId}`}
              className={`flex items-center gap-2.5 ${isRtl ? "pr-9 pl-3" : "pl-9 pr-3"} py-2 rounded-md hover:bg-canvas transition-colors`}
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

      {editing && (
        <DataSourceEditModal source={src} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
