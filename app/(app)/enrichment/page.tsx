import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { EnrichmentHubClient } from "@/components/catalog/EnrichmentHubClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function EnrichmentPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const canEdit = await canEditMetadata(user);
  const t = getServerT();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.nav.enrichment },
        ]}
        user={user}
        contextTypes={["COLUMN", "TABLE", "TERM"]}
      />
      <main className="px-8 py-7 pb-14">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink">{"AI Metadata Enrichment"}</h1>
          <p className="text-sm text-muted mt-1">
            {"Review AI-suggested descriptions, data quality rules, and column/table type classifications in one place."}
          </p>
        </div>
        <EnrichmentHubClient canEdit={canEdit} />
      </main>
    </>
  );
}
