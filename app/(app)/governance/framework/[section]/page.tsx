import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import { listGovDocs, getHiddenSections } from "@/lib/queries/gov-framework";
import { listCommEvents } from "@/lib/queries/gov-comm-events";
import { FrameworkSectionClient } from "@/components/governance/FrameworkSectionClient";
import { CommunicationPlanClient } from "@/components/governance/CommunicationPlanClient";
import { fwSectionFromSlug, fwSectionKey } from "@/lib/gov-framework-sections";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function FrameworkSectionPage({ params }: { params: { section: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const sectionCode = fwSectionFromSlug(params.section);
  if (!sectionCode) notFound();

  const [docs, hiddenSections, canManage, t] = await Promise.all([
    listGovDocs(sectionCode), getHiddenSections(), canManageDomain(user, "GOVERNANCE"), getServerT(user),
  ]);
  // A hidden section exists only for those who manage the framework (who can show it again).
  const isHidden = hiddenSections.includes(sectionCode);
  if (isHidden && !canManage) notFound();

  const events = sectionCode === "COMMUNICATION" ? await listCommEvents() : null;

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis",             href: "/dashboard" },
          { label: t.governance.pageTitle,     href: "/governance" },
          { label: t.governance.framework,href: "/governance/framework" },
          { label: t.governance.sectionLabels[fwSectionKey(sectionCode)] },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        {isHidden && (
          <p className="mb-4 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{t.governance.fw.sectionHiddenBanner}</p>
        )}
        <FrameworkSectionClient
          sectionCode={sectionCode}
          initialDocs={docs}
          userId={user.userId}
          canManage={canManage}
          // The Communication Plan leads with its schedule; the plan documents follow.
          top={events && <CommunicationPlanClient initialEvents={events} canManage={canManage} hiddenSections={hiddenSections} />}
          docsHeading={events ? t.commPlan.plansTitle : undefined}
        />
      </main>
    </>
  );
}
