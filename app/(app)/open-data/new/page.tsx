import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { OpenDataEditor } from "@/components/open-data/OpenDataEditor";

export const dynamic = "force-dynamic";

export default async function NewOpenDataPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  if (user.role === "VIEWER") redirect("/open-data");

  const dimensions = await sql<{ code: string; name: string }[]>`
    SELECT dimension_code AS code, dimension_name_text AS name
    FROM bayanat.dq_dimensions ORDER BY dimension_code
  `;

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Open Data", href: "/open-data" },
          { label: "New Dataset" },
        ]}
        user={user}
        contextTypes={[]}
      />
      <main className="px-8 py-7 pb-14">
        <OpenDataEditor
          mode="create"
          dataset={null}
          initialColumns={[]}
          initialDqIssues={[]}
          dimensions={dimensions}
          canEdit={true}
          userId={user.userId}
        />
      </main>
    </>
  );
}
