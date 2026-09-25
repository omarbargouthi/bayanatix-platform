import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { getGlossaryStats, getGlossaryDomains, getGlossaryTerms } from "@/lib/queries/glossary";
import { GlossaryPageClient } from "./GlossaryPageClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function GlossaryPage({
  searchParams,
}: {
  searchParams: { domain?: string; subdomain?: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const domainFilter = searchParams.domain ? Number(searchParams.domain) : null;
  const subDomainFilter = searchParams.subdomain ? Number(searchParams.subdomain) : null;

  const [stats, domains, terms, canEdit] = await Promise.all([
    getGlossaryStats(),
    getGlossaryDomains(),
    getGlossaryTerms({ domainId: domainFilter ?? undefined, subDomainId: subDomainFilter ?? undefined }),
    canEditMetadata(user),
  ]);
  const t = getServerT();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.glossary.pageTitle },
        ]}
        user={user}
      />
      <GlossaryPageClient
        stats={stats}
        domains={domains}
        terms={terms}
        domainFilter={domainFilter}
        subDomainFilter={subDomainFilter}
        canEdit={canEdit}
        canEditGovernance={user.role === "ADMIN"}
      />
    </>
  );
}
