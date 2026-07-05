import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { listOpenDatasets } from "@/lib/queries/open-data";
import { OpenDataList } from "@/components/open-data/OpenDataList";

export const dynamic = "force-dynamic";

export default async function OpenDataPage({
  searchParams,
}: {
  searchParams: { status?: string; search?: string; page?: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const status = searchParams.status ?? "all";
  const search = searchParams.search ?? "";
  const page   = Math.max(1, Number(searchParams.page ?? "1"));

  const { data: datasets, total } = await listOpenDatasets({ status, search, page, limit: 20 });

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Open Data" },
        ]}
        user={user}
        contextTypes={[]}
      />
      <main className="px-8 py-7 pb-14">
        <OpenDataList
          initialDatasets={datasets}
          initialTotal={total}
          initialStatus={status}
          initialSearch={search}
          initialPage={page}
          canCreate={user.role === "ADMIN" || user.role === "STEWARD" || user.role === "OFFICER"}
        />
      </main>
    </>
  );
}
