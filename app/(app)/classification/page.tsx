import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getClassificationStats } from "@/lib/queries/catalog";
import { ClassificationClient } from "@/components/classification/ClassificationClient";

export const dynamic = "force-dynamic";

export default async function ClassificationPage({
  searchParams,
}: {
  searchParams: { filter?: string; search?: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const stats = await getClassificationStats();

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
          canEdit={user.role === "ADMIN" || user.role === "STEWARD"}
        />
      </main>
    </>
  );
}
