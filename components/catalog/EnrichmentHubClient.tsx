"use client";

import { useState } from "react";
import { useLang } from "@/lib/lang-context";
import { EnrichmentReviewClient } from "./EnrichmentReviewClient";
import { ColumnTypeReviewClient } from "./ColumnTypeReviewClient";
import { TableTypeReviewClient } from "./TableTypeReviewClient";

type HubTab = "descriptions" | "dq" | "columnTypes" | "tableTypes";

// Single landing page for everything AI-suggests across the catalog — description,
// DQ rule, column type (Business/Technical), and table type (Master/Transactional/...)
// suggestions each used to live behind their own sidebar link (or buried as a sub-tab
// of one another); this groups all four as peer top-level tabs instead.
export function EnrichmentHubClient({ canEdit }: { canEdit: boolean }) {
  const { t } = useLang();
  const e = t.enrichment;
  const [tab, setTab] = useState<HubTab>("descriptions");

  const tabs: { key: HubTab; label: string }[] = [
    { key: "descriptions", label: e.tabDescriptions },
    { key: "dq",           label: e.tabDqRules },
    { key: "columnTypes",  label: e.tabColumnTypes },
    { key: "tableTypes",   label: e.tabTableTypes },
  ];

  return (
    <div>
      <div className="flex items-center gap-1 bg-canvas-soft rounded-lg p-1 mb-5 w-fit">
        {tabs.map((it) => (
          <button
            key={it.key}
            onClick={() => setTab(it.key)}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-md ${tab === it.key ? "bg-white text-brand-purple shadow-sm" : "text-muted"}`}
          >
            {it.label}
          </button>
        ))}
      </div>

      {tab === "descriptions" && <EnrichmentReviewClient canEdit={canEdit} fixedTab="descriptions" />}
      {tab === "dq"           && <EnrichmentReviewClient canEdit={canEdit} fixedTab="dq" />}
      {tab === "columnTypes"  && <ColumnTypeReviewClient canEdit={canEdit} />}
      {tab === "tableTypes"   && <TableTypeReviewClient canEdit={canEdit} />}
    </div>
  );
}
