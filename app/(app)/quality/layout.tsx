import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessDomain } from "@/lib/can";

export default async function QualityLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!(await canAccessDomain(user, "DATA_QUALITY"))) redirect("/dashboard");
  return <>{children}</>;
}
