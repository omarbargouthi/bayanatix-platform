import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { RequestsPageClient } from "./RequestsPageClient";

export default async function RequestsPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: "Asset Requests" }]} user={user} />
      <RequestsPageClient />
    </>
  );
}
