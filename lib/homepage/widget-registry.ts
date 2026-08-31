import type { SessionUser } from "../types";
import { getNotifications } from "../queries/notifications";
import { listSavedSearches } from "../queries/saved-searches";
import { getRecentAssets } from "../queries/dashboard";
import { getMyRequestsSummary, getMyStewardDomains } from "../queries/homepage";
import { WIDGET_META } from "./widget-meta";

export { DEFAULT_WIDGET_KEYS, ALL_WIDGET_KEYS, resolveWidgetKeys, WIDGET_META } from "./widget-meta";

// Server-only: adds each widget's data-fetcher on top of the client-safe
// metadata in widget-meta.ts. Only import this file from server components /
// API routes — it pulls in DB query modules.
const FETCHERS: Record<string, (userId: string, session: SessionUser) => Promise<unknown>> = {
  needs_action: async (userId) => (await getNotifications(userId)).filter((n) => !n.actioned).slice(0, 5),
  my_requests: (userId) => getMyRequestsSummary(userId),
  steward_domains: (userId) => getMyStewardDomains(userId),
  quick_links: async (_userId, session) => ({ isAdmin: session.role === "ADMIN" }),
  saved_searches: (userId) => listSavedSearches(userId),
  recent_assets: (userId) => getRecentAssets(userId, 5),
};

export async function fetchWidgetData(key: string, userId: string, session: SessionUser): Promise<unknown> {
  if (!(key in WIDGET_META)) return null;
  return FETCHERS[key](userId, session);
}
