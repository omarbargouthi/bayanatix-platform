import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { BulkOperationsClient } from "@/components/bulk/BulkOperationsClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BulkOperationsPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const canEdit = await canEditMetadata(user);
  const t = getServerT();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.nav.bulkOperations },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink">{t.nav.bulkOperations}</h1>
          <p className="text-sm text-muted mt-1">
            {"Download catalog metadata to Excel, edit offline, then upload to preview and apply changes in bulk."}
          </p>
        </div>
        <BulkOperationsClient canEdit={canEdit} />
      </main>
    </>
  );
}
