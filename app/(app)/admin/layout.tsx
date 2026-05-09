import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { AdminTabNav } from "@/components/admin/AdminTabNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Administration" },
        ]}
        user={user}
      />
      <AdminTabNav />
      {children}
    </>
  );
}
