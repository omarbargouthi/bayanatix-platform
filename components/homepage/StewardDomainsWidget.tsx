"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { StewardDomain } from "@/lib/queries/homepage";

export function StewardDomainsWidget({ domains }: { domains: StewardDomain[] }) {
  const { t } = useLang();
  const h = t.homepage;
  if (domains.length === 0) return <p className="text-[12px] text-muted">{h.stewardDomains.empty}</p>;
  return (
    <ul className="space-y-2.5">
      {domains.map((d) => (
        <li key={d.glossaryId} className="flex items-center justify-between gap-2">
          <Link href={`/glossary/${d.glossaryId}`} className="text-[12px] font-medium text-ink hover:text-brand-purple hover:underline truncate">
            {d.name}
          </Link>
          {d.openRequestCount > 0 && (
            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {h.stewardDomains.openRequests.replace("{n}", String(d.openRequestCount))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
