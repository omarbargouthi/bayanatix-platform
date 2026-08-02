import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { EnrichmentReviewClient } from "@/components/catalog/EnrichmentReviewClient";

export const dynamic = "force-dynamic";

export default async function EnrichmentPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const canEdit = await canEditMetadata(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Enrichment" },
        ]}
        user={user}
        contextTypes={["COLUMN", "TERM"]}
      />
      <main className="px-8 py-7 pb-14">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink">{"AI Metadata Enrichment"}</h1>
          <p className="text-sm text-muted mt-1">
            {"Review AI-suggested descriptions and data quality rules before they become official."}
          </p>
        </div>
        <EnrichmentReviewClient canEdit={canEdit} />
      </main>
    </>
  );
}
