import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { DsaRegistry } from "@/components/sharing/DsaRegistry";
import { getServerT } from "@/lib/i18n/server";
import { DomainAccessPanel } from "@/components/domain-access/DomainAccessPanel";

export const dynamic = "force-dynamic";

export default async function SharingPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: t.sharing.pageTitle },
        ]}
        user={user}
        contextTypes={[]}
        collaborationHref="/collaboration?newTitle=Data%20Sharing%20Discussion"
      />
      <main className="flex-1 overflow-y-auto">
        <DsaRegistry />
        <div className="px-8 pb-8">
          <DomainAccessPanel domain="SHARING" domainLabel={t.nav.sharing} />
        </div>
      </main>
    </>
  );
}
