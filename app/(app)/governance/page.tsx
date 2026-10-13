import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getSectionCounts, getHiddenSections } from "@/lib/queries/gov-framework";
import { listRegisters } from "@/lib/queries/gov-registers";
import { listFrameworks } from "@/lib/queries/gov-compliance";
import { GovernancePageClient } from "./GovernancePageClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [sectionCounts, hiddenSections, registers, frameworks] = await Promise.all([
    getSectionCounts(),
    getHiddenSections(),
    listRegisters(),
    listFrameworks(false), // only regulations the admin has marked applicable — matches /governance/compliance
  ]);
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[{ label: "Bayanis", href: "/dashboard" }, { label: t.governance.pageTitle }]}
        user={user}
      />
      <GovernancePageClient
        sectionCounts={sectionCounts}
        hiddenSections={hiddenSections}
        registers={registers}
        frameworks={frameworks}
      />
    </>
  );
}
