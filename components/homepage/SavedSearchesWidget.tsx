"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { SavedSearch } from "@/lib/queries/saved-searches";

export function SavedSearchesWidget({ searches }: { searches: SavedSearch[] }) {
  const { t } = useLang();
  const h = t.homepage;
  if (searches.length === 0) return <p className="text-[12px] text-muted">{h.savedSearches.empty}</p>;
  return (
    <ul className="space-y-2">
      {searches.map((s) => (
        <li key={s.savedSearchId}>
          <Link
            href={`/search?q=${encodeURIComponent(s.queryString)}`}
            className="flex items-center gap-2 text-[12px] font-medium text-ink hover:text-brand-purple hover:underline"
          >
            <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <span className="truncate">{s.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
