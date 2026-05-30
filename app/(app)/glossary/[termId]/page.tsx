import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { getGlossaryTermById } from "@/lib/queries/glossary";
import { GlossaryTermPageClient } from "./GlossaryTermPageClient";

export const dynamic = "force-dynamic";

export default async function GlossaryTermPage({
  params,
}: {
  params: { termId: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const id = Number(params.termId);
  if (!Number.isFinite(id)) notFound();

  const term = await getGlossaryTermById(id);
  if (!term) notFound();

  const canEdit = await canEditMetadata(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat",           href: "/dashboard" },
          { label: "Business Glossary", href: "/glossary" },
          ...(term.domainName
            ? [{ label: term.domainName, href: `/glossary?domain=${term.domainId}` }]
            : []),
          { label: term.termName },
        ]}
        user={user}
      />
      <GlossaryTermPageClient term={term} canEdit={canEdit} />
    </>
  );
}
