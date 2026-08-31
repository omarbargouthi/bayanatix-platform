import type { ComponentType } from "react";
import { IconBell, IconFlag, IconShield, IconSearch, IconTable, IconLines } from "@/components/layout/icons";

// Client-safe widget metadata (no server-only query imports) — shared by the
// customize-mode UI (HomepageClient) and the server-side registry
// (lib/homepage/widget-registry.ts), which adds fetchData on top of this.
export type WidgetTitleKey = "needsAction" | "myRequests" | "stewardDomains" | "quickLinks" | "savedSearches" | "recentAssets";

export type WidgetMeta = { key: string; titleKey: WidgetTitleKey; icon: ComponentType<{ className?: string }> };

export const WIDGET_META: Record<string, WidgetMeta> = {
  needs_action:    { key: "needs_action",    titleKey: "needsAction",    icon: IconBell },
  my_requests:     { key: "my_requests",     titleKey: "myRequests",     icon: IconFlag },
  steward_domains: { key: "steward_domains", titleKey: "stewardDomains", icon: IconShield },
  quick_links:     { key: "quick_links",     titleKey: "quickLinks",     icon: IconLines },
  saved_searches:  { key: "saved_searches",  titleKey: "savedSearches",  icon: IconSearch },
  recent_assets:   { key: "recent_assets",   titleKey: "recentAssets",   icon: IconTable },
};

export const DEFAULT_WIDGET_KEYS = ["needs_action", "my_requests", "steward_domains", "quick_links"];
export const ALL_WIDGET_KEYS = Object.keys(WIDGET_META);

export function resolveWidgetKeys(saved: string[] | null): string[] {
  const keys = saved ?? DEFAULT_WIDGET_KEYS;
  return keys.filter((k) => k in WIDGET_META);
}
