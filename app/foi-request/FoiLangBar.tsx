"use client";

// These pages are public (no session, citizen-facing) and live outside
// app/(app)/layout.tsx, so there's no ambient LangProvider — mirrors
// app/login/LoginLangBar.tsx's same fix for the same reason.

import { LangProvider, useLang } from "@/lib/lang-context";
import { LanguagePicker } from "@/components/layout/LanguagePicker";

function Bar() {
  const { isRtl } = useLang();
  return (
    <div className={`flex ${isRtl ? "justify-start" : "justify-end"} mb-4 max-w-2xl mx-auto px-4 pt-4`}>
      <LanguagePicker />
    </div>
  );
}

export function FoiLangBar({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <Bar />
      {children}
    </LangProvider>
  );
}
