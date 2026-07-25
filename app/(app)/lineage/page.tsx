import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { LineageGraphClient } from "@/components/lineage/LineageGraphClient";

export const dynamic = "force-dynamic";

export default async function LineagePage({
  searchParams,
}: {
  searchParams: { assetType?: string; assetId?: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const assetType = searchParams.assetType === "DATA_ATTRIBUTES" ? "DATA_ATTRIBUTES" : searchParams.assetType === "DATA_ENTITIES" ? "DATA_ENTITIES" : null;
  const assetId = searchParams.assetId ? Number(searchParams.assetId) : null;

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Data Lineage" },
        ]}
        user={user}
        contextTypes={[]}
      />
      <main className="h-[calc(100vh-120px)]">
        <LineageGraphClient
          initialAssetType={assetType}
          initialAssetId={assetId && Number.isFinite(assetId) ? assetId : null}
          canManage={user.role === "ADMIN" || user.role === "STEWARD"}
        />
      </main>
    </>
  );
}
