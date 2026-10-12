import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getServerT } from "@/lib/i18n/server";
import { resolveSourceScope, listSources, listSourceStewards, getSourceStats, getTopAssets } from "@/lib/reports/source-stats";
import { SourceStatsFilters, SourceStatsView } from "@/components/reports/SourceStatsView";

export const dynamic = "force-dynamic";

// Reports › Source Systems: the statistics of the source systems, filtered by source and
// steward. The Dashboard shows the same figures (lib/reports/source-stats.ts) for the
// sources the signed-in user has a governance role on.
export default async function SourceSystemsReportPage({ searchParams }: { searchParams: { source?: string; steward?: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const sourceId  = searchParams.source ? Number(searchParams.source) : null;
  const stewardId = searchParams.steward?.trim() || null;
  const { scope, seesAll, allowed } = await resolveSourceScope(user, { sourceId, stewardId });
  // The source list offers what the steward filter (or the user's own roles) leaves.
  const pickable = seesAll && stewardId ? (await resolveSourceScope(user, { stewardId })).scope : allowed;

  const [stats, top, sources, stewards, t] = await Promise.all([
    getSourceStats(scope), getTopAssets(scope, 10), listSources(pickable),
    seesAll ? listSourceStewards() : Promise.resolve(null), getServerT(user),
  ]);
  const s = t.sourceStats;

  return (
    <>
      <Header crumbs={[{ label: "Bayanis", href: "/dashboard" }, { label: t.nav.reports, href: "/reports" }, { label: s.reportTitle }]} user={user} />
      <main className="px-8 py-7 pb-14">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div>
            <h1 className="text-2xl font-bold text-brand-deep">{s.reportTitle}</h1>
            <p className="text-sm text-ink-soft mt-0.5">{seesAll ? s.reportSubtitle : s.reportSubtitleMine}</p>
          </div>
          <SourceStatsFilters sources={sources} stewards={stewards} sourceId={sourceId} stewardId={seesAll ? stewardId : null} />
        </div>
        <SourceStatsView stats={stats} top={top} />
      </main>
    </>
  );
}
