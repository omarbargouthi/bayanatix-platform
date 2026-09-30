import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { getLanguages } from "@/lib/queries/languages";
import { getDomainAccess, type DomainCode } from "@/lib/can";
import { verifyLicense } from "@/lib/license/verify";
import { AppShell } from "@/components/layout/AppShell";
import type { Lang } from "@/lib/lang-context";

const NAV_DOMAINS: DomainCode[] = ["GOVERNANCE", "DATA_QUALITY", "DATA_PRIVACY", "SHARING", "FOI", "OPEN_DATA"];

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

  const domainEntries = await Promise.all(
    NAV_DOMAINS.map(async (d) => [d, await getDomainAccess(user, d)] as const),
  );
  const domainAccess = Object.fromEntries(domainEntries) as Record<DomainCode, "WRITE" | "READ" | "NONE">;

  // Hard-block already happened in middleware; this is only for the grace-period
  // warning banner, so an admin sees the countdown before it becomes a lockout.
  const licenseStatus = await verifyLicense(process.env.LICENSE_KEY);

  return <AppShell user={user} initialLang={initialLang} domainAccess={domainAccess} licenseStatus={licenseStatus}>{children}</AppShell>;
}
