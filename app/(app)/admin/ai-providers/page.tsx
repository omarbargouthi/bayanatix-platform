import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { AiProvidersClient } from "@/components/admin/AiProvidersClient";

export const dynamic = "force-dynamic";

export default async function AiProvidersPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Administration", href: "/admin/user-management" },
          { label: "AI Providers" },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink">AI Providers</h1>
          <p className="text-sm text-muted mt-1">
            Configure the model(s) behind AI Enrichment — Managed API, cloud-hosted in-region, or self-hosted open-weights. Switching providers is configuration, not code.
          </p>
        </div>
        <AiProvidersClient />
      </main>
    </>
  );
}
