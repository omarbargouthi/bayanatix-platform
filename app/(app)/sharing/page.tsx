import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { DsaRegistry } from "@/components/sharing/DsaRegistry";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SharingPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.sharing.pageTitle },
        ]}
        user={user}
        contextTypes={[]}
        collaborationHref="/collaboration?newTitle=Data%20Sharing%20Discussion"
      />
      <main className="flex-1 overflow-y-auto">
        <DsaRegistry />
      </main>
    </>
  );
}
