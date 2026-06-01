"use client";

import { useState } from "react";
import { useLang } from "@/lib/lang-context";
import { DataCategoriesTab } from "@/components/retention/DataCategoriesTab";
import { LegalHoldsTab } from "@/components/retention/LegalHoldsTab";
import { RetentionOverviewTab } from "@/components/retention/RetentionOverviewTab";

type Tab = "overview" | "categories" | "holds";

export function PrivacyClient({ userRole }: { userRole: string }) {
  const { t } = useLang();
  const r = t.retention;
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "overview",    label: r.tabOverview,    icon: "📊" },
    { id: "categories",  label: r.tabCategories,  icon: "🗂️" },
    { id: "holds",       label: r.tabLegalHolds,  icon: "⚖️" },
  ];

  return (
    <main className="page-content">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">{r.pageTitle}</h1>
        <p className="text-[13px] text-muted mt-1">{r.pageDesc}</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-line">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={[
              "flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px",
              tab === tb.id
                ? "border-brand-purple text-brand-purple"
                : "border-transparent text-muted hover:text-ink",
            ].join(" ")}
          >
            <span>{tb.icon}</span>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview"   && <RetentionOverviewTab />}
      {tab === "categories" && <DataCategoriesTab />}
      {tab === "holds"      && <LegalHoldsTab />}
    </main>
  );
}
