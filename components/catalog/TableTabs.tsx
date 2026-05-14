"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

const TABS = ["Schema", "Data Quality", "Activity", "Lineage", "Relationships", "Sample Data", "Custom Properties"] as const;
type Tab = typeof TABS[number];

export function TableTabs({ active }: { active: Tab }) {
  const router   = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(tab: Tab) {
    const p = new URLSearchParams(searchParams.toString());
    if (tab === "Schema") p.delete("tab"); else p.set("tab", tab);
    router.replace(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="flex gap-1 border-b border-line mb-5">
      {TABS.map((t) => (
        <button
          key={t}
          onClick={() => navigate(t)}
          className={
            "px-4 py-3 text-sm font-semibold transition-colors -mb-px border-b-2 " +
            (active === t
              ? "text-brand-purple border-brand-purple"
              : "text-ink-soft border-transparent hover:text-brand-purple")
          }
        >
          {t}
        </button>
      ))}
    </div>
  );
}
