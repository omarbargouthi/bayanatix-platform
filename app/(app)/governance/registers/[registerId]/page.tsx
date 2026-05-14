import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getRegister, listColumns, listEntries } from "@/lib/queries/gov-registers";
import { RegisterDetailClient } from "@/components/governance/RegisterDetailClient";

export const dynamic = "force-dynamic";

export default async function RegisterDetailPage({ params }: { params: { registerId: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const id = Number(params.registerId);
  const [register, columns, entries] = await Promise.all([
    getRegister(id),
    listColumns(id),
    listEntries(id),
  ]);
  if (!register) notFound();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Governance", href: "/governance" },
          { label: "Registers", href: "/governance/registers" },
          { label: register.name },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <RegisterDetailClient
          register={register}
          initialColumns={columns}
          initialEntries={entries}
          isAdmin={user.role === "ADMIN"}
        />
      </main>
    </>
  );
}
