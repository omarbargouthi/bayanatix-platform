import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessDomain } from "@/lib/can";

// The public citizen-facing FOI pages (submit / track) live outside this
// (app) route group at app/foi-request/** and are unaffected — this only
// gates the officer-facing case-management pages under app/(app)/foi/**.
export default async function FoiLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!(await canAccessDomain(user, "FOI"))) redirect("/dashboard");
  return <>{children}</>;
}
