import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { ColumnTypeReviewClient } from "@/components/catalog/ColumnTypeReviewClient";

export const dynamic = "force-dynamic";

export default async function ColumnTypesPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const canEdit = await canEditMetadata(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Column Types" },
        ]}
        user={user}
        contextTypes={["COLUMN"]}
      />
      <main className="px-8 py-7 pb-14">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink">Column Type Suggestions</h1>
          <p className="text-sm text-muted mt-1">
            Review auto-suggested Business/Technical column classifications from the catalog crawler and confirm or override them.
          </p>
        </div>
        <ColumnTypeReviewClient canEdit={canEdit} />
      </main>
    </>
  );
}
