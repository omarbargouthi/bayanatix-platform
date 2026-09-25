import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { PrivacyClient } from "./PrivacyClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const t = getServerT();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.nav.privacy },
        ]}
        user={user}
      />
      <PrivacyClient userRole={user.role} />
    </>
  );
}
