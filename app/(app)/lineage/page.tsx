import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { LineagePageClient } from "./LineagePageClient";
import { getServerT } from "@/lib/i18n/server";

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
  const t = await getServerT(user);

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: t.lineage.pageTitle }]} user={user} />
      <LineagePageClient
        initialAssetType={assetType}
        initialAssetId={Number.isFinite(assetId) ? assetId : null}
        canManage={user.role === "ADMIN" || user.role === "STEWARD"}
      />
    </>
  );
}
