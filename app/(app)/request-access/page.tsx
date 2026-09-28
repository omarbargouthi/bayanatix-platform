import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { RequestAccessClient } from "./RequestAccessClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// Available to every logged-in user, unlike the gated domain pages — this is
// the self-service entry point for asking for access, not a privileged view.
export default async function RequestAccessPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.requestAccess.pageTitle },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <RequestAccessClient />
      </main>
    </>
  );
}
