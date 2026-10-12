import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getRecentAssets, getRecentSearches } from "@/lib/queries/dashboard";
import { DashboardClient } from "./DashboardClient";
import { redirect } from "next/navigation";
import { getServerT } from "@/lib/i18n/server";
import { canAccessDomain, canManageDomain } from "@/lib/can";
import { resolveSourceScope, listSources, listSourceStewards, getSourceStats, getTopAssets } from "@/lib/reports/source-stats";
import { getGovAnnouncements } from "@/lib/queries/gov-announcements";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: { source?: string; steward?: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  // Source statistics are personal: the sources this user has a governance role on. The
  // Data Management Office side starts there too, and can widen to every source
  // (?source=all), one source, or a steward's sources with the filters.
  const wantsAll  = searchParams.source === "all";
  const sourceId  = searchParams.source && !wantsAll ? Number(searchParams.source) : null;
  const stewardId = searchParams.steward?.trim() || null;
  const { scope, seesAll, allowed, isOwn } = await resolveSourceScope(user, { sourceId, stewardId, all: wantsAll, ownByDefault: true });
  const pickable = seesAll && stewardId ? (await resolveSourceScope(user, { stewardId })).scope : allowed;

  const [recentAssets, recentSearches, sourceStats, topAssets, sources, stewards, announcements, canOpenGovernance, canManageGovernance] = await Promise.all([
    getRecentAssets(user.userId, 10),
    getRecentSearches(user.userId, 5),
    getSourceStats(scope),
    getTopAssets(scope, 5),
    listSources(pickable),
    seesAll ? listSourceStewards() : Promise.resolve(null),
    getGovAnnouncements(8),
    canAccessDomain(user, "GOVERNANCE"),
    canManageDomain(user, "GOVERNANCE"),
  ]);

  const firstName = user.fullName.split(" ")[0];
  const t = await getServerT(user);

  return (
    <>
      {/* The dashboard has its own search in the welcome banner, so the header leaves its search out. */}
      <Header crumbs={[{ label: "Bayanis", href: "/dashboard" }, { label: t.nav.dashboard }]} user={user} hideSearch />
      <DashboardClient
        firstName={firstName}
        recentAssets={recentAssets}
        recentSearches={recentSearches}
        sourceStats={sourceStats}
        topAssets={topAssets}
        sources={sources}
        stewards={stewards}
        sourceId={sourceId}
        stewardId={seesAll ? stewardId : null}
        seesAllSources={seesAll}
        showsOwnSources={isOwn && sourceId == null}
        allSourcesChosen={seesAll && wantsAll && !stewardId}
        announcements={announcements}
        canOpenGovernance={canOpenGovernance}
        canManageGovernance={canManageGovernance}
      />
    </>
  );
}
