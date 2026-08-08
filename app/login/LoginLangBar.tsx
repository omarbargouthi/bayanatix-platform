"use client";

// Lets a user pick a language before signing in (spec FR-4.4) — wraps just the form
// panel in LangProvider so the choice is available pre-auth; PATCH /api/users/me/language
// 401s silently here (no session yet), the localStorage/cookie write still persists
// the choice so it takes effect immediately after login via lang-context's normal
// "saved preference" resolution.

import { LangProvider, useLang } from "@/lib/lang-context";
import { LanguagePicker } from "@/components/layout/LanguagePicker";

function Bar() {
  const { isRtl } = useLang();
  return (
    <div className={`flex ${isRtl ? "justify-start" : "justify-end"} mb-4`}>
      <LanguagePicker />
    </div>
  );
}

export function LoginLangBar({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <Bar />
      {children}
    </LangProvider>
  );
}
