import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getSectionCounts } from "@/lib/queries/gov-framework";
import { listRegisters } from "@/lib/queries/gov-registers";
import { listFrameworks } from "@/lib/queries/gov-compliance";
import { GovernancePageClient } from "./GovernancePageClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [sectionCounts, registers, frameworks] = await Promise.all([
    getSectionCounts(),
    listRegisters(),
    listFrameworks(false), // only regulations the admin has marked applicable — matches /governance/compliance
  ]);
  const t = getServerT();

  return (
    <>
      <Header
        crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: t.governance.pageTitle }]}
        user={user}
      />
      <GovernancePageClient
        sectionCounts={sectionCounts}
        registers={registers}
        frameworks={frameworks}
      />
    </>
  );
}
