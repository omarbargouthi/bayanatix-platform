import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { listFrameworks, listUsers } from "@/lib/queries/gov-compliance";
import { MaturityIndexClient } from "@/components/governance/MaturityIndexClient";

export const dynamic = "force-dynamic";

export default async function MaturityIndexSetupPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [frameworks, users] = await Promise.all([listFrameworks(), listUsers()]);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Admin",   href: "/admin/user-management" },
          { label: "Maturity Index Setup" },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-brand-deep">Maturity Index Setup</h1>
          <p className="text-sm text-ink-soft mt-1">
            Edit requirement details, evidence codes, domains and assignments across compliance frameworks.
          </p>
        </div>
        <MaturityIndexClient frameworks={frameworks} users={users} />
      </main>
    </>
  );
}
