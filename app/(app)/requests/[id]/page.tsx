import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { RequestDetailClient } from "./RequestDetailClient";

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: "Requests", href: "/requests" },
          { label: `#${params.id}` },
        ]}
        user={user}
      />
      <RequestDetailClient />
    </>
  );
}
