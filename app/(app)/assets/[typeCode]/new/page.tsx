import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getCustomAssetTypeByCode } from "@/lib/queries/custom-assets";
import { NewAssetClient } from "./NewAssetClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewAssetPage({ params }: { params: { typeCode: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "STEWARD") redirect(`/assets/${params.typeCode}`);

  const type = await getCustomAssetTypeByCode(params.typeCode.toUpperCase());
  if (!type || !type.isEnabled) notFound();
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.nav.customAssets, href: "/assets" },
          { label: type.typeNameText, href: `/assets/${params.typeCode}` },
          { label: "New" },
        ]}
        user={user}
      />
      <NewAssetClient typeCode={params.typeCode.toLowerCase()} typeName={type.typeNameText} />
    </>
  );
}
