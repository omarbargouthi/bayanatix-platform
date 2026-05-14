import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { listFrameworks, listRequirements } from "@/lib/queries/gov-compliance";
import { ComplianceClient } from "@/components/governance/ComplianceClient";

export const dynamic = "force-dynamic";

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: { fw?: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const frameworks = await listFrameworks();
  const fwId = searchParams.fw ? Number(searchParams.fw) : (frameworks[0]?.frameworkId ?? null);
  const requirements = fwId ? await listRequirements(fwId) : [];
  const activeFramework = frameworks.find((f) => f.frameworkId === fwId) ?? frameworks[0] ?? null;

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Governance", href: "/governance" },
          { label: "Compliance" },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <ComplianceClient
          frameworks={frameworks}
          activeFramework={activeFramework}
          initialRequirements={requirements}
        />
      </main>
    </>
  );
}
