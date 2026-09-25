import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getRegister, listColumns, listEntries } from "@/lib/queries/gov-registers";
import { RegisterDetailClient } from "@/components/governance/RegisterDetailClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function RegisterDetailPage({ params }: { params: { registerId: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const isAdmin = user.role === "ADMIN";
  const id = Number(params.registerId);

  // Admins can view archived registers; regular users cannot
  const [register, columns, entries] = await Promise.all([
    getRegister(id, isAdmin),
    listColumns(id),
    listEntries(id),
  ]);
  if (!register) notFound();

  // Block non-admins from accessing archived registers
  if (register.deletedAt && !isAdmin) notFound();
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.governance.pageTitle, href: "/governance" },
          { label: t.governance.registers, href: "/governance/registers" },
          { label: register.name },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <RegisterDetailClient
          register={register}
          initialColumns={columns}
          initialEntries={entries}
          isAdmin={isAdmin}
        />
      </main>
    </>
  );
}
