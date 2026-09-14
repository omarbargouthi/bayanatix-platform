import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getClassificationStatsScoped } from "@/lib/queries/catalog";
import { ClassificationClient } from "@/components/classification/ClassificationClient";

export const dynamic = "force-dynamic";

export default async function ClassificationPage({
  searchParams,
}: {
  searchParams: { filter?: string; search?: string; dataSourceId?: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const dataSourceId = searchParams.dataSourceId ? Number(searchParams.dataSourceId) : undefined;
  const stats = await getClassificationStatsScoped({ sourceId: dataSourceId });

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Classification" },
        ]}
        user={user}
        contextTypes={["COLUMN", "TERM"]}
      />
      <main className="px-8 py-7 pb-14">
        <ClassificationClient
          initialStats={stats}
          initialFilter={searchParams.filter ?? "all"}
          initialSearch={searchParams.search ?? ""}
          initialDataSourceId={dataSourceId ? String(dataSourceId) : ""}
          canEdit={user.role === "ADMIN" || user.role === "STEWARD"}
        />
      </main>
    </>
  );
}
