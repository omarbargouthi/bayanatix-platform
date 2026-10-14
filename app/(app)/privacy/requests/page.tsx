import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getServerT } from "@/lib/i18n/server";
import { DataSubjectRequestsTab } from "@/components/retention/DataSubjectRequestsTab";

export const dynamic = "force-dynamic";

// Data subject requests: admins, data protection officers and stewards (owners act on their tables).
export default async function DataSubjectRequestsPage({ searchParams }: { searchParams: { dsr?: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!(user.role === "ADMIN" || user.role === "OFFICER" || user.role === "STEWARD")) redirect("/privacy");
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: t.nav.privacy, href: "/privacy" },
          { label: t.nav.privacyRequests },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <DataSubjectRequestsTab userRole={user.role} initialId={Number(searchParams.dsr) || null} />
      </main>
    </>
  );
}
