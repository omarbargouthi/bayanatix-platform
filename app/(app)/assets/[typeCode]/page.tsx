import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getCustomAssetTypeByCode } from "@/lib/queries/custom-assets";
import { AssetListClient } from "./AssetListClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AssetListPage({ params }: { params: { typeCode: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const type = await getCustomAssetTypeByCode(params.typeCode.toUpperCase());
  if (!type) notFound();
  const t = getServerT();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.nav.customAssets, href: "/assets" },
          { label: type.typeNameText },
        ]}
        user={user}
      />
      <AssetListClient typeCode={params.typeCode.toLowerCase()} typeName={type.typeNameText} isEnabled={type.isEnabled} canWrite={user.role === "ADMIN" || user.role === "STEWARD"} />
    </>
  );
}
