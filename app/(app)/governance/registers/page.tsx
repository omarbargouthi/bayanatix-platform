import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { listRegisters, listDeletedRegisters } from "@/lib/queries/gov-registers";
import { RegistersClient } from "@/components/governance/RegistersClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function RegistersPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const isAdmin = user.role === "ADMIN";
  const [registers, deletedRegisters] = await Promise.all([
    listRegisters(),
    isAdmin ? listDeletedRegisters() : Promise.resolve([]),
  ]);
  const t = getServerT();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.governance.pageTitle, href: "/governance" },
          { label: t.governance.registers },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <RegistersClient
          initialRegisters={registers}
          initialDeletedRegisters={deletedRegisters}
          isAdmin={isAdmin}
        />
      </main>
    </>
  );
}
