import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getSectionCounts } from "@/lib/queries/gov-framework";
import { FrameworkPageClient } from "./FrameworkPageClient";

export const dynamic = "force-dynamic";

export default async function FrameworkPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const counts = await getSectionCounts();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Governance", href: "/governance" },
          { label: "Governance Framework" },
        ]}
        user={user}
      />
      <FrameworkPageClient counts={counts} />
    </>
  );
}
