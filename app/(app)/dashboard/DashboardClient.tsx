"use client";

import { useLang } from "@/lib/lang-context";
import { DashboardSearch } from "@/components/catalog/DashboardSearch";
import Link from "next/link";
import { SourceStatsFilters, SourceStatsView } from "@/components/reports/SourceStatsView";
import { GovAnnouncements } from "@/components/governance/GovAnnouncements";
import type { SourceStats, TopAssets, SourceLite, StewardLite } from "@/lib/reports/source-stats";
import type { GovAnnouncement } from "@/lib/queries/gov-announcements";
import type { RecentAsset } from "@/lib/types";

type Props = {
  firstName:      string;
  recentAssets:   RecentAsset[];
  recentSearches: string[];
  sourceStats:    SourceStats;
  topAssets:      TopAssets;
  /** The sources the filter offers. */
  sources:        SourceLite[];
  /** The stewards the filter offers; null when the user is held to their own sources. */
  stewards:       StewardLite[] | null;
  sourceId:       number | null;
  stewardId:      string | null;
  seesAllSources: boolean;
  /** The statistics are the user's own sources (the default view). */
  showsOwnSources: boolean;
  /** A user who sees all sources asked for all of them. */
  allSourcesChosen: boolean;
  announcements:  GovAnnouncement[];
  canOpenGovernance:   boolean;
  canManageGovernance: boolean;
};

export function DashboardClient({
  firstName, recentAssets, recentSearches,
  sourceStats, topAssets, sources, stewards, sourceId, stewardId, seesAllSources, showsOwnSources, allSourcesChosen,
  announcements, canOpenGovernance, canManageGovernance,
}: Props) {
  const { t } = useLang();

  return (
    <main className="px-8 py-7 pb-14">

      {/* Welcome banner */}
      {/* The banner itself must not clip: the search's dropdown hangs below it, over the
          cards (hence the z-index). Only the decorative blobs are clipped, in their own layer. */}
      <section className="relative z-20 rounded-xl bg-gradient-to-br from-[#f0f2ff] via-[#e7ecfb] to-[#e6e0f5] border border-line p-9 mb-6">
        <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none" aria-hidden="true">
          <div className="absolute -top-20 -right-10 w-56 h-56 rounded-full bg-brand-light/45 blur-2xl" />
          <div className="absolute -bottom-16 left-[10%] w-48 h-48 rounded-full bg-brand-purple/25 blur-2xl" />
        </div>
        <div className="relative">
          <h1 className="text-2xl font-bold text-brand-deep mb-4">
            {t.dashboard.welcome.replace("{name}", firstName)}
          </h1>
          <DashboardSearch recentAssets={recentAssets} recentSearches={recentSearches} />
        </div>
      </section>

      {/* What the Governance Framework is announcing */}
      <GovAnnouncements items={announcements} canOpen={canOpenGovernance} canManage={canManageGovernance} />

      {/* Source systems: the user's own, or all of them for the Data Management Office */}
      <section>
        <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="text-xl font-bold">{showsOwnSources ? t.sourceStats.dashboardTitleMine : t.sourceStats.dashboardTitleAll}</h2>
            <p className="text-sm text-ink-soft mt-0.5">
              {seesAllSources ? t.sourceStats.dashboardSubtitleOffice : t.sourceStats.dashboardSubtitleMine}{" "}
              <Link href="/reports/sources" className="text-brand-purple font-semibold hover:underline">{t.sourceStats.openReport}</Link>
            </p>
          </div>
          {(seesAllSources || sources.length > 1) && (
            <SourceStatsFilters sources={sources} stewards={stewards} sourceId={sourceId} stewardId={stewardId} ownByDefault allChosen={allSourcesChosen} />
          )}
        </div>
        <SourceStatsView stats={sourceStats} top={topAssets} emptyText={seesAllSources && showsOwnSources ? t.sourceStats.noOwnSourcesOffice : undefined} />
      </section>

    </main>
  );
}
