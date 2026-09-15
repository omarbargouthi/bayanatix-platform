import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminHeader } from "@/components/layout/AdminHeader";

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
      {/* Suspense required — AdminHeader uses useSearchParams() to track the
          active User Management sub-tab */}
      <Suspense fallback={<div className="sticky top-0 z-20 h-[60px] bg-white border-b border-line" />}>
        <AdminHeader user={user} />
      </Suspense>
      {children}
    </>
  );
}
