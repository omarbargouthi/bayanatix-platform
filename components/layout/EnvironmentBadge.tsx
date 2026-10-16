"use client";
import { useLang } from "@/lib/lang-context";

// Which physical deployment this is (DEV/TEST/PROD/DEMO) is a fact about the running
// instance, not something an admin should be able to toggle in the UI — a DB
// setting travels with the database (e.g. a prod DB cloned into test would then
// wrongly show "PROD" in test), while an env var is set once per deployment and
// always matches reality. NEXT_PUBLIC_ so it's readable client-side; unset/unknown
// values render nothing rather than guessing. Labels are translated (common.environment).
const ENV = (process.env.NEXT_PUBLIC_APP_ENVIRONMENT ?? "").toUpperCase();

const ENV_STYLE: Record<string, string> = {
  DEV:  "bg-blue-100 text-blue-700 border-blue-200",
  TEST: "bg-amber-100 text-amber-700 border-amber-200",
  PROD: "bg-red-100 text-red-700 border-red-200",
  DEMO: "bg-violet-100 text-violet-700 border-violet-200",
};

export function EnvironmentBadge({ className = "" }: { className?: string }) {
  const { t } = useLang();
  const style = ENV_STYLE[ENV];
  if (!style) return null;
  return (
    <span className={`inline-flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${style} ${className}`}>
      {t.common.environment[ENV as keyof typeof t.common.environment]}
    </span>
  );
}
