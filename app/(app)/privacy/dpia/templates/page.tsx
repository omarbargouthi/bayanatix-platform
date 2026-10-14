import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getServerT } from "@/lib/i18n/server";
import { isDpiaReviewer } from "@/lib/privacy/dpia";
import { DpiaTemplatesClient } from "@/components/privacy/DpiaTemplatesClient";

export const dynamic = "force-dynamic";

// The impact assessment questionnaires — admins and data protection officers only.
export default async function DpiaTemplatesPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!isDpiaReviewer(user.role)) redirect("/privacy/dpia");
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: t.nav.privacy, href: "/privacy" },
          { label: t.nav.privacyDpia, href: "/privacy/dpia" },
          { label: t.dpiaTemplates.title },
        ]}
        user={user}
      />
      <DpiaTemplatesClient isAdmin={user.role === "ADMIN"} />
    </>
  );
}
