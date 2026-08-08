import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { LanguagesAdminClient } from "@/components/admin/LanguagesAdminClient";

export const dynamic = "force-dynamic";

export default async function LanguagesAdminPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Administration", href: "/admin/user-management" },
          { label: "Languages & Translations" },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink">Languages &amp; Translations</h1>
          <p className="text-sm text-muted mt-1">
            Manage which languages are available, track translation coverage, and AI-translate UI strings and reference data.
          </p>
        </div>
        <LanguagesAdminClient />
      </main>
    </>
  );
}
