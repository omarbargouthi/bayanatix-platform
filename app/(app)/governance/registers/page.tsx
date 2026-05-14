import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { listRegisters } from "@/lib/queries/gov-registers";
import { RegistersClient } from "@/components/governance/RegistersClient";

export const dynamic = "force-dynamic";

export default async function RegistersPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const registers = await listRegisters();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Governance", href: "/governance" },
          { label: "Registers" },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <RegistersClient initialRegisters={registers} />
      </main>
    </>
  );
}
