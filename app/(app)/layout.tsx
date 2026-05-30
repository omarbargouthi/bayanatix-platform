import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import type { Lang } from "@/lib/lang-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const rawLang = (await cookies()).get("bayanatix_lang")?.value;
  const initialLang: Lang = rawLang === "ar" ? "ar" : "en";
  return <AppShell user={user} initialLang={initialLang}>{children}</AppShell>;
}
