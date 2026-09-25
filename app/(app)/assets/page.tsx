import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getCustomAssetTypes } from "@/lib/queries/custom-assets";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function CustomAssetsHubPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const types = await getCustomAssetTypes(false);
  const t = await getServerT(user);

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: t.nav.customAssets }]} user={user} />
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-brand-deep mb-1">Custom Assets</h1>
          <p className="text-sm text-muted">
            Admin-defined asset types linked to your catalog and to each other. Manage types under{" "}
            {user.role === "ADMIN" ? <Link href="/admin/custom-assets" className="text-brand-purple hover:underline">Custom Asset Types</Link> : "Admin → Custom Asset Types"}.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {types.map((assetType) => (
            <Link key={assetType.typeId} href={`/assets/${assetType.typeCode.toLowerCase()}`}>
              <div className="card-padded h-full hover:shadow-md transition-shadow flex items-center gap-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: assetType.colorHex ?? "#6058A0" }} />
                <div>
                  <div className="font-semibold text-ink text-sm">{assetType.typeNameText}</div>
                  <div className="text-xs text-muted mt-0.5">{assetType.instanceCount ?? 0} instance{(assetType.instanceCount ?? 0) === 1 ? "" : "s"}</div>
                </div>
              </div>
            </Link>
          ))}
          {types.length === 0 && (
            <div className="text-sm text-muted col-span-2">
              No custom asset types yet.
              {user.role === "ADMIN" && <> Create one under <Link href="/admin/custom-assets" className="text-brand-purple hover:underline">Custom Asset Types</Link>.</>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
