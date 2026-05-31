import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import type { Lang } from "@/lib/lang-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const rawLang = (await cookies()).get("bayanatix_lang")?.value;
  // Pass the saved language through; LangProvider validates it against system config on mount.
  const initialLang: Lang = rawLang && rawLang !== "en" ? rawLang : "en";
  return <AppShell user={user} initialLang={initialLang}>{children}</AppShell>;
}
