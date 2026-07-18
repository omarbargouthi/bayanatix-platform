import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { FoiQueue } from "@/components/foi/FoiQueue";

export const dynamic = "force-dynamic";

export default async function FoiPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Freedom of Information" },
        ]}
        user={session}
        contextTypes={[]}
        collaborationHref="/collaboration?newTitle=FOI%20Discussion"
      />
      <main className="flex-1 overflow-y-auto">
        <FoiQueue />
      </main>
    </>
  );
}
