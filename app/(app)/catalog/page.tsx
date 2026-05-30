import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { getCatalogStats, getSourcesWithSchemas, getGlossaryRoots } from "@/lib/queries/catalog";
import { CatalogPageClient } from "./CatalogPageClient";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [stats, sources, glossaries, canEdit] = await Promise.all([
    getCatalogStats(),
    getSourcesWithSchemas(),
    getGlossaryRoots(),
    canEditMetadata(user),
  ]);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Catalog" },
        ]}
        user={user}
      />
      <CatalogPageClient
        stats={stats}
        sources={sources}
        glossaries={glossaries}
        canEdit={canEdit}
      />
    </>
  );
}
