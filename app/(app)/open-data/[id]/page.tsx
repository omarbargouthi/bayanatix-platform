import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOpenDataset, getDatasetColumns, getDatasetDqIssues } from "@/lib/queries/open-data";
import { OpenDataEditor } from "@/components/open-data/OpenDataEditor";

export const dynamic = "force-dynamic";

export default async function OpenDataDetailPage({ params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const datasetId = Number(params.id);
  const [dataset, columns, dqIssues, dimensions] = await Promise.all([
    getOpenDataset(datasetId),
    getDatasetColumns(datasetId),
    getDatasetDqIssues(datasetId),
    sql<{ code: string; name: string }[]>`
      SELECT dimension_code AS code, dimension_name_text AS name
      FROM bayanat.dq_dimensions ORDER BY dimension_code
    `,
  ]);

  if (!dataset) notFound();

  const canEdit =
    user.role === "ADMIN" ||
    user.role === "STEWARD" ||
    dataset.raisedByUserId === user.userId;

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Open Data", href: "/open-data" },
          { label: dataset.datasetName },
        ]}
        user={user}
        contextTypes={[]}
      />
      <main className="px-8 py-7 pb-14">
        <OpenDataEditor
          mode="edit"
          dataset={dataset}
          initialColumns={columns}
          initialDqIssues={dqIssues}
          dimensions={dimensions}
          canEdit={canEdit}
          userId={user.userId}
          userRole={user.role}
        />
      </main>
    </>
  );
}
