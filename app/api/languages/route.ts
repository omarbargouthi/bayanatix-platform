import { NextResponse } from "next/server";
import { getLanguages, getLanguagePolicy } from "@/lib/queries/languages";

/**
 * Runtime language picker list (spec FR-4.4) — respects the self-selection policy's
 * choosable-language subset and coverage threshold, not just is_enabled_indicator.
 * Deliberately unauthenticated: the login page's picker needs this list before a
 * session exists, and the language catalog itself isn't sensitive.
 */
export async function GET() {
  const [languages, policy] = await Promise.all([getLanguages(false), getLanguagePolicy()]);

  if (!policy.selfSelectionEnabled) {
    return NextResponse.json({ languages: languages.filter((l) => l.isDefault), selfSelectionEnabled: false });
  }

  const choosable = languages.filter((l) => {
    if (policy.choosableCodes && !policy.choosableCodes.includes(l.languageCode)) return false;
    if (l.languageCode === "en") return true; // base language is always available, coverage is meaningless for it
    return (l.coveragePct ?? 0) >= policy.coverageThresholdPct;
  });

  return NextResponse.json({ languages: choosable, selfSelectionEnabled: true });
}
