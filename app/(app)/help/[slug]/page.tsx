import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getServerT } from "@/lib/i18n/server";
import { HELP_DOCS } from "@/lib/help/docs";
import { HelpDocClient } from "@/components/help/HelpDocClient";

export const dynamic = "force-dynamic";

export default async function HelpDocPage({ params }: { params: { slug: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!HELP_DOCS.some((d) => d.slug === params.slug)) notFound();
  const t = await getServerT(user);

  return (
    <>
      <Header crumbs={[{ label: "Bayanis", href: "/dashboard" }, { label: t.help.title, href: "/help" }]} user={user} />
      <HelpDocClient slug={params.slug} isAdmin={user.role === "ADMIN"} />
    </>
  );
}
