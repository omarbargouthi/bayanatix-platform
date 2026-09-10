import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import {
  getCatalogStats, getSourcesWithSchemas, getGlossaryRoots, getGlossaryStats,
  getCdeCoverage, getBusinessClassificationBreakdown, getCdeMetadataQuality, getCdeDataQuality,
} from "@/lib/queries/catalog";
import { CatalogPageClient } from "./CatalogPageClient";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [
    stats, sources, glossaries, glossaryStats, canEdit,
    cdeCoverage, classification, cdeMetadataQuality, cdeDataQuality,
  ] = await Promise.all([
    getCatalogStats(),
    getSourcesWithSchemas(),
    getGlossaryRoots(),
    getGlossaryStats(),
    canEditMetadata(user),
    getCdeCoverage(),
    getBusinessClassificationBreakdown(),
    getCdeMetadataQuality(),
    getCdeDataQuality(),
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
        glossaryStats={glossaryStats}
        cdeCoverage={cdeCoverage}
        classification={classification}
        cdeMetadataQuality={cdeMetadataQuality}
        cdeDataQuality={cdeDataQuality}
        canEdit={canEdit}
      />
    </>
  );
}
