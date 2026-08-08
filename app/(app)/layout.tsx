import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { getLanguages } from "@/lib/queries/languages";
import { AppShell } from "@/components/layout/AppShell";
import type { Lang } from "@/lib/lang-context";

// Preference precedence for SSR's initial language (AC-3): the user's persisted
// choice wins (cross-device), then a saved cookie (e.g. not-yet-logged-in device),
// then the entity default. LangProvider re-validates against /api/languages on
// mount in case the choice was since disabled.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");

  let initialLang: Lang;
  if (user.preferredLanguageCode) {
    initialLang = user.preferredLanguageCode;
  } else {
    const rawLang = (await cookies()).get("bayanatix_lang")?.value;
    if (rawLang) {
      initialLang = rawLang;
    } else {
      const languages = await getLanguages(false);
      initialLang = languages.find((l) => l.isDefault)?.languageCode ?? "en";
    }
  }

  return <AppShell user={user} initialLang={initialLang}>{children}</AppShell>;
}
