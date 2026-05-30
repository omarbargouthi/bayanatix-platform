import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { getGlossaryStats, getGlossaryDomains, getGlossaryTerms } from "@/lib/queries/glossary";
import { GlossaryPageClient } from "./GlossaryPageClient";

export const dynamic = "force-dynamic";

export default async function GlossaryPage({
  searchParams,
}: {
  searchParams: { domain?: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const domainFilter = searchParams.domain ? Number(searchParams.domain) : null;

  const [stats, domains, terms, canEdit] = await Promise.all([
    getGlossaryStats(),
    getGlossaryDomains(),
    getGlossaryTerms(domainFilter ?? undefined),
    canEditMetadata(user),
  ]);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Business Glossary" },
        ]}
        user={user}
      />
      <GlossaryPageClient
        stats={stats}
        domains={domains}
        terms={terms}
        domainFilter={domainFilter}
        canEdit={canEdit}
      />
    </>
  );
}
