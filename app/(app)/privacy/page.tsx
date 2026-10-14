import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { PrivacyClient } from "./PrivacyClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// Data Retention. Data subject requests and impact assessments used to be tabs here and
// now have their own pages; old links (including those in notifications) still arrive.
export default async function PrivacyPage({ searchParams }: { searchParams: { tab?: string; dsr?: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (searchParams.tab === "dsr") redirect(`/privacy/requests${searchParams.dsr ? `?dsr=${encodeURIComponent(searchParams.dsr)}` : ""}`);
  if (searchParams.tab === "dpia") redirect("/privacy/dpia");
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: t.nav.privacy, href: "/privacy" },
          { label: t.nav.privacyRetention },
        ]}
        user={user}
      />
      <PrivacyClient userRole={user.role} />
    </>
  );
}
