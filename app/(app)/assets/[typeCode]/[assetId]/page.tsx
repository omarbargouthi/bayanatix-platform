import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import {
  getCustomAssetTypeByCode, getTypeAttributes, getInstance, getLinksForAsset, getRelationshipTypesForAssetType,
} from "@/lib/queries/custom-assets";
import { getStakeholders } from "@/lib/queries/stakeholders";
import { getGovernanceRoleLabels } from "@/lib/queries/governance-config";
import { AssetActivityPanel } from "@/components/custom-assets/AssetActivityPanel";
import { AssetDetailClient } from "./AssetDetailClient";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({ params }: { params: { typeCode: string; assetId: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const type = await getCustomAssetTypeByCode(params.typeCode.toUpperCase());
  if (!type) notFound();

  const assetId = Number(params.assetId);
  if (!Number.isFinite(assetId)) notFound();

  const instance = await getInstance(assetId);
  if (!instance || instance.typeId !== type.typeId) notFound();

  const assetTypeCode = `CUSTOM:${type.typeCode}`;

  const [attributes, links, relationshipTypes, stakeholders, roleLabels] = await Promise.all([
    getTypeAttributes(type.typeId),
    getLinksForAsset(assetTypeCode, assetId),
    getRelationshipTypesForAssetType(assetTypeCode),
    getStakeholders(assetTypeCode, assetId),
    getGovernanceRoleLabels(),
  ]);

  const canWrite = user.role === "ADMIN" || user.role === "STEWARD";

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Custom Assets", href: "/assets" },
          { label: type.typeNameText, href: `/assets/${params.typeCode}` },
          { label: instance.assetNameText },
        ]}
        user={user}
      />
      <AssetDetailClient
        typeCode={params.typeCode.toLowerCase()}
        typeName={type.typeNameText}
        assetTypeCode={assetTypeCode}
        assetId={assetId}
        assetNameText={instance.assetNameText}
        nameArText={instance.nameArText}
        descriptionText={instance.descriptionText}
        statusCode={instance.statusCode}
        attributes={attributes}
        initialValues={instance.attributes}
        links={links}
        relationshipTypes={relationshipTypes}
        initialStakeholders={stakeholders}
        roleLabels={{
          OWNER:        roleLabels.OWNER        ?? { name: "Owner",            description: null },
          BIZ_STEWARD:  roleLabels.BIZ_STEWARD  ?? { name: "Business Steward", description: null },
          TECH_STEWARD: roleLabels.TECH_STEWARD ?? { name: "Technical Steward",description: null },
        }}
        canWrite={canWrite}
      />
      <div className="px-6 max-w-4xl mx-auto pb-10">
        <div className="card p-6">
          <h3 className="font-bold text-sm mb-4">Activity</h3>
          <AssetActivityPanel assetTypeCode={assetTypeCode} assetId={assetId} />
        </div>
      </div>
    </>
  );
}
