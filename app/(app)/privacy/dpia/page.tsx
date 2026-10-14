import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getServerT } from "@/lib/i18n/server";
import { DpiaRegisterTab } from "@/components/privacy/DpiaRegisterTab";

export const dynamic = "force-dynamic";

// The register of impact assessments; each assessment opens at /privacy/dpia/{id}.
export default async function DpiaRegisterPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: t.nav.privacy, href: "/privacy" },
          { label: t.nav.privacyDpia },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <DpiaRegisterTab />
      </main>
    </>
  );
}
