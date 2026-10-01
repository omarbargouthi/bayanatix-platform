import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import {
  listFrameworks,
  listRequirements,
  getLevelConfig,
  listUsers,
  getMaturitySelections,
  getConfigItems,
  listDomainConfig,
  getComplianceTrend,
  computeFrameworkMaturityScore,
} from "@/lib/queries/gov-compliance";
import { ComplianceClient } from "@/components/governance/ComplianceClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: { fw?: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const frameworks      = await listFrameworks(false); // only regulations the admin has marked applicable
  const fwId            = searchParams.fw ? Number(searchParams.fw) : (frameworks[0]?.frameworkId ?? null);
  const activeFramework = frameworks.find((f) => f.frameworkId === fwId) ?? frameworks[0] ?? null;

  const isMaturityMode = activeFramework?.assessmentMode === "MATURITY";

  const [requirements, levelConfig, users, maturitySelections, configItems, domainConfig, trend, maturityScore] = await Promise.all([
    fwId ? listRequirements(fwId)          : Promise.resolve([]),
    fwId ? getLevelConfig(fwId)            : Promise.resolve([]),
    listUsers(),
    fwId ? getMaturitySelections(fwId)     : Promise.resolve([]),
    fwId ? getConfigItems(fwId)            : Promise.resolve([]),
    fwId ? listDomainConfig(fwId)          : Promise.resolve([]),
    fwId ? getComplianceTrend(fwId, 12)    : Promise.resolve([]),
    // Same weighted-domain-maturity methodology the Dashboard uses for its
    // overall/per-domain numbers, so this page's Compliance Score agrees with
    // it for frameworks that have real domain weighting (NDI_2026, NAII) —
    // a plain complete/total ratio ignores weights/levels entirely.
    fwId && isMaturityMode ? computeFrameworkMaturityScore(fwId) : Promise.resolve(null),
  ]);
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat",         href: "/dashboard" },
          { label: t.governance.pageTitle, href: "/governance" },
          { label: t.compliance.pageTitle },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <ComplianceClient
          // Forces a full remount on framework switch — ComplianceClient's many
          // useState(initial...) hooks otherwise keep their FIRST-mount values
          // forever, since React reuses the component instance across re-renders
          // at the same tree position even when these initial* props change.
          key={fwId ?? "none"}
          frameworks={frameworks}
          activeFramework={activeFramework}
          initialRequirements={requirements}
          initialLevelConfig={levelConfig}
          users={users}
          initialMaturitySelections={maturitySelections}
          initialConfigItems={configItems}
          initialDomainConfig={domainConfig}
          trend={trend}
          maturityScore={maturityScore}
          currentUser={user}
        />
      </main>
    </>
  );
}
