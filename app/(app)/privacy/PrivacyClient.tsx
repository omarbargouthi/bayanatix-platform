"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/lib/lang-context";
import { DataCategoriesTab } from "@/components/retention/DataCategoriesTab";
import { LegalHoldsTab } from "@/components/retention/LegalHoldsTab";
import { RetentionOverviewTab } from "@/components/retention/RetentionOverviewTab";
import { DataSubjectRequestsTab } from "@/components/retention/DataSubjectRequestsTab";

type Tab = "overview" | "categories" | "holds" | "dsr";

export function PrivacyClient({ userRole }: { userRole: string }) {
  const { t } = useLang();
  const r = t.retention;
  const searchParams = useSearchParams();
  // Data subject requests: admins, data protection officers and stewards (owners act on their tables).
  const canSeeDsr = userRole === "ADMIN" || userRole === "OFFICER" || userRole === "STEWARD";
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "dsr" && canSeeDsr ? "dsr" : "overview");
  const dsrId = Number(searchParams.get("dsr")) || null;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "overview",    label: r.tabOverview,    icon: "📊" },
    { id: "categories",  label: r.tabCategories,  icon: "🗂️" },
    { id: "holds",       label: r.tabLegalHolds,  icon: "⚖️" },
    ...(canSeeDsr ? [{ id: "dsr" as Tab, label: t.dsr.tab, icon: "🧾" }] : []),
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
      {tab === "categories" && <DataCategoriesTab userRole={userRole} />}
      {tab === "holds"      && <LegalHoldsTab />}
      {tab === "dsr"        && <DataSubjectRequestsTab userRole={userRole} initialId={dsrId} />}
    </main>
  );
}
