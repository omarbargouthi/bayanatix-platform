import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { FoiQueue } from "@/components/foi/FoiQueue";
import { getServerT } from "@/lib/i18n/server";
import { DomainAccessPanel } from "@/components/domain-access/DomainAccessPanel";

export const dynamic = "force-dynamic";

export default async function FoiPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const t = await getServerT(session);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.nav.foi },
        ]}
        user={session}
        contextTypes={[]}
        collaborationHref="/collaboration?newTitle=FOI%20Discussion"
      />
      <main className="flex-1 overflow-y-auto">
        <FoiQueue />
        <div className="px-8 pb-8">
          <DomainAccessPanel domain="FOI" domainLabel={t.nav.foi} />
        </div>
      </main>
    </>
  );
}
