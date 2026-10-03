import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerLang, getServerT } from "@/lib/i18n/server";
import { getConsentNotice, needsConsent } from "@/lib/privacy/policy-settings";
import { ConsentClient } from "./ConsentClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consent · Bayanis" };

// Shown after sign-in when an administrator has switched the consent notice on
// and this user hasn't accepted the current version (see app/(app)/layout.tsx).
// Page labels come from lib/i18n (section "consent"); the notice is English-base
// with translations from Languages & Translations, falling back to English.
export default async function ConsentPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!(await needsConsent(user.userId))) redirect("/homepage");

  const lang = await getServerLang(user);
  const [t, notice] = await Promise.all([getServerT(user), getConsentNotice(lang)]);

  return (
    <ConsentClient
      dir={lang === "ar" ? "rtl" : "ltr"}
      noticeDir={notice.lang === "ar" ? "rtl" : "ltr"}
      labels={t.consent}
      userName={user.fullName}
      title={notice.title}
      text={notice.text}
      version={notice.version}
    />
  );
}
