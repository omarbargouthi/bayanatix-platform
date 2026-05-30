"use client";

import { useLang } from "@/lib/lang-context";

export function SchemaTabNav({ schemaId, activeView }: { schemaId: number; activeView: string }) {
  const { t } = useLang();
  const c = t.catalog;

  return (
    <div className="flex gap-1 border-b border-line mb-6">
      <a
        href={`/catalog/${schemaId}`}
        className={
          "px-4 py-3 text-sm font-semibold transition-colors -mb-px border-b-2 " +
          (activeView === "tables"
            ? "text-brand-purple border-brand-purple"
            : "text-ink-soft border-transparent hover:text-brand-purple")
        }
      >
        {c.tabTables}
      </a>
      <a
        href={`/catalog/${schemaId}?view=data-model`}
        className={
          "px-4 py-3 text-sm font-semibold transition-colors -mb-px border-b-2 " +
          (activeView === "data-model"
            ? "text-brand-purple border-brand-purple"
            : "text-ink-soft border-transparent hover:text-brand-purple")
        }
      >
        {c.tabDataModel}
      </a>
    </div>
  );
}
