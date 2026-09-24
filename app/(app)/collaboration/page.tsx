import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { CollaborationPageClient } from "./CollaborationPageClient";

export default async function CollaborationPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: "Collaboration" }]} user={user} />
      <CollaborationPageClient />
    </>
  );
}
