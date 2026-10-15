import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getServerT } from "@/lib/i18n/server";
import { BreachDetailClient } from "@/components/privacy/BreachDetailClient";

export const dynamic = "force-dynamic";

export default async function BreachPage({ params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: t.nav.privacy, href: "/privacy" },
          { label: t.nav.privacyBreaches, href: "/privacy/breaches" },
          { label: `#${Number(params.id)}` },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <BreachDetailClient breachId={Number(params.id)} />
      </main>
    </>
  );
}
