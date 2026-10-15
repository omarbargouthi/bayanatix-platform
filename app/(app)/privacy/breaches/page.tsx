import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getServerT } from "@/lib/i18n/server";
import { BreachRegister } from "@/components/privacy/BreachRegister";

export const dynamic = "force-dynamic";

// The register of personal data breaches; each breach opens at /privacy/breaches/{id}.
export default async function BreachRegisterPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: t.nav.privacy, href: "/privacy" },
          { label: t.nav.privacyBreaches },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <BreachRegister />
      </main>
    </>
  );
}
