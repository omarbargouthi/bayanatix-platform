import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { DsaRegistry } from "@/components/sharing/DsaRegistry";

export const dynamic = "force-dynamic";

export default async function SharingPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Data Sharing Agreements" },
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
