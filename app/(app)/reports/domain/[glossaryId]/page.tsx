import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getDomainScorecard } from "@/lib/queries/reports";
import { DomainScorecardClient } from "./DomainScorecardClient";

export const dynamic = "force-dynamic";

export default async function DomainScorecardPage({ params }: { params: { glossaryId: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const glossaryId = Number(params.glossaryId);
  const scorecard = await getDomainScorecard(glossaryId);
  if (!scorecard) notFound();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Reports", href: "/reports" },
          { label: scorecard.domain.name },
        ]}
        user={user}
      />
      <DomainScorecardClient scorecard={scorecard} glossaryId={glossaryId} />
    </>
  );
}
