"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/lang-context";
import { WIDGET_META, ALL_WIDGET_KEYS } from "@/lib/homepage/widget-meta";
import { WidgetShell } from "@/components/homepage/WidgetShell";
import { NeedsActionWidget } from "@/components/homepage/NeedsActionWidget";
import { MyRequestsWidget } from "@/components/homepage/MyRequestsWidget";
import { StewardDomainsWidget } from "@/components/homepage/StewardDomainsWidget";
import { QuickLinksWidget } from "@/components/homepage/QuickLinksWidget";
import { SavedSearchesWidget } from "@/components/homepage/SavedSearchesWidget";
import { RecentAssetsWidget } from "@/components/homepage/RecentAssetsWidget";
import type { Notification } from "@/lib/types";
import type { RecentAsset } from "@/lib/types";
import type { MyRequestsSummary, StewardDomain } from "@/lib/queries/homepage";
import type { SavedSearch } from "@/lib/queries/saved-searches";

type Props = {
  firstName: string;
  initialWidgetKeys: string[];
  widgetData: Record<string, unknown>;
};

function renderWidgetBody(key: string, data: unknown) {
  switch (key) {
    case "needs_action":    return <NeedsActionWidget items={data as Notification[]} />;
    case "my_requests":     return <MyRequestsWidget summary={data as MyRequestsSummary} />;
    case "steward_domains": return <StewardDomainsWidget domains={data as StewardDomain[]} />;
    case "quick_links":     return <QuickLinksWidget isAdmin={(data as { isAdmin: boolean }).isAdmin} />;
    case "saved_searches":  return <SavedSearchesWidget searches={data as SavedSearch[]} />;
    case "recent_assets":   return <RecentAssetsWidget assets={data as RecentAsset[]} />;
    default: return null;
  }
}

export function HomepageClient({ firstName, initialWidgetKeys, widgetData }: Props) {
  const router = useRouter();
  const { t } = useLang();
  const h = t.homepage;
  const [order, setOrder] = useState<string[]>(initialWidgetKeys);
  const [customizing, setCustomizing] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  async function persist(next: string[]) {
    setOrder(next);
    await fetch("/api/homepage/layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgetKeys: next }),
    });
    router.refresh();
  }

  function removeWidget(key: string) {
    persist(order.filter((k) => k !== key));
  }
  function addWidget(key: string) {
    persist([...order, key]);
    setAddPanelOpen(false);
  }

  function handleDrop() {
    if (dragIndex === null || dragOverIndex === null || dragIndex === dragOverIndex) {
      setDragIndex(null); setDragOverIndex(null);
      return;
    }
    const next = [...order];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dragOverIndex, 0, moved);
    setDragIndex(null); setDragOverIndex(null);
    persist(next);
  }

  const availableToAdd = ALL_WIDGET_KEYS.filter((k) => !order.includes(k));

  return (
    <main className="px-8 py-7 pb-14">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-deep">{t.dashboard.welcome.replace("{name}", firstName)}</h1>
          <p className="text-sm text-muted mt-1">{h.pageDesc}</p>
        </div>
        <div className="flex items-center gap-2">
          {customizing && (
            <div className="relative">
              <button onClick={() => setAddPanelOpen((v) => !v)} className="btn btn-sm btn-primary">
                {h.addWidget}
              </button>
              {addPanelOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-line rounded-xl shadow-xl z-20 overflow-hidden">
                  <div className="px-4 py-2 border-b border-line-soft text-[11px] font-bold uppercase tracking-wide text-muted">
                    {h.addWidgetTitle}
                  </div>
                  {availableToAdd.length === 0 ? (
                    <div className="px-4 py-4 text-[12px] text-muted">{h.allAdded}</div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto">
                      {availableToAdd.map((key) => {
                        const meta = WIDGET_META[key];
                        return (
                          <button key={key} onClick={() => addWidget(key)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-canvas-soft text-left">
                            <meta.icon className="w-4 h-4 text-brand-purple shrink-0" />
                            <span className="text-[12px] font-medium text-ink">{h.widgetTitles[meta.titleKey]}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <button onClick={() => { setCustomizing((v) => !v); setAddPanelOpen(false); }}
            className={`btn btn-sm ${customizing ? "btn-primary" : ""}`}>
            {customizing ? h.doneCustomizing : h.customize}
          </button>
        </div>
      </div>

      {order.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm font-semibold text-ink mb-1">{h.noWidgets}</p>
          <p className="text-[12px] text-muted">{h.noWidgetsHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {order.map((key, i) => {
            const meta = WIDGET_META[key];
            if (!meta) return null;
            return (
              <WidgetShell
                key={key}
                title={h.widgetTitles[meta.titleKey]}
                Icon={meta.icon}
                customizing={customizing}
                removeLabel={h.removeWidget}
                onRemove={() => removeWidget(key)}
                draggable={customizing}
                isDragOver={dragOverIndex === i && dragIndex !== i}
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                onDrop={handleDrop}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
              >
                {renderWidgetBody(key, widgetData[key])}
              </WidgetShell>
            );
          })}
        </div>
      )}
    </main>
  );
}
