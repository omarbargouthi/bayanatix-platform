import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { getPolicySettings, needsConsent } from "@/lib/privacy/policy-settings";
import { ConsentClient } from "./ConsentClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consent · Bayanis" };

// Shown after sign-in when an administrator has switched the consent notice on
// and this user hasn't accepted the current version (see app/(app)/layout.tsx).
export default async function ConsentPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!(await needsConsent(user.userId))) redirect("/homepage");

  const s = await getPolicySettings();
  const lang = user.preferredLanguageCode ?? (await cookies()).get("bayanatix_lang")?.value ?? "en";
  const useAr = lang === "ar" && !!s.consentTextAr.trim();

  return (
    <ConsentClient
      lang={useAr ? "ar" : "en"}
      userName={user.fullName}
      title={useAr ? s.consentTitleAr || s.consentTitleEn : s.consentTitleEn}
      text={useAr ? s.consentTextAr : s.consentTextEn}
      version={s.consentVersion}
    />
  );
}
