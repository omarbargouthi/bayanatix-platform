import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getServerT } from "@/lib/i18n/server";
import { DpiaDetailClient } from "@/components/privacy/DpiaDetailClient";

export const dynamic = "force-dynamic";

export default async function DpiaPage({ params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const dpiaId = Number(params.id);
  if (!Number.isFinite(dpiaId)) notFound();
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: t.nav.privacy, href: "/privacy" },
          { label: t.nav.privacyDpia, href: "/privacy/dpia" },
        ]}
        user={user}
      />
      <DpiaDetailClient dpiaId={dpiaId} />
    </>
  );
}
