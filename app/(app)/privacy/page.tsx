import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { PrivacyClient } from "./PrivacyClient";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Privacy" },
        ]}
        user={user}
      />
      <PrivacyClient userRole={user.role} />
    </>
  );
}
