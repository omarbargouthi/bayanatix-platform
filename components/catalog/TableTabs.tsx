"use client";

import { useState } from "react";

const TABS = ["Schema", "Activity", "Lineage", "Sample Data", "Custom Properties"] as const;

export function TableTabs() {
  const [active, setActive] = useState<typeof TABS[number]>("Schema");
  return (
    <div className="flex gap-1 border-b border-line mb-5">
      {TABS.map((t) => (
        <button
          key={t}
          onClick={() => setActive(t)}
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
