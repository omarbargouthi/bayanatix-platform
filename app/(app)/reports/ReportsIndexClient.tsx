"use client";

import Link from "next/link";
import type { BusinessDomain } from "@/lib/queries/reports";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";

function buildTiles(t: I18nStrings) {
  const r = t.reports;
  return [
    { name: r.mcm.title, description: r.mcm.subtitle, href: "/reports/mcm" },
    { name: r.dq.title, description: r.dq.subtitle, href: "/reports/dq" },
    { name: r.dc.title, description: r.dc.subtitle, href: "/reports/dc" },
    { name: r.dsi.title, description: r.dsi.subtitle, href: "/reports/dsi" },
    { name: r.od.title, description: r.od.subtitle, href: "/reports/od" },
    { name: r.foi.title, description: r.foi.subtitle, href: "/reports/foi" },
    { name: r.pdp.title, description: r.pdp.subtitle, href: "/reports/pdp" },
    { name: r.dg.title, description: r.dg.subtitle, href: "/reports/dg-summary" },
    { name: r.retention.title, description: r.retention.subtitle, href: "/reports/retention" },
    { name: "PI Access by Role", description: "Which roles/activities access which personal-data columns.", href: "/reports/pi-access" },
  ];
}

export function ReportsIndexClient({ domains }: { domains: BusinessDomain[] }) {
  const { t } = useLang();
  const ri = t.reports.index;
  const tiles = buildTiles(t);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-brand-deep mb-1">{ri.title}</h1>
        <p className="text-sm text-muted mb-6">{ri.subtitle}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tiles.map((tile) => (
            <Link key={tile.href} href={tile.href}>
              <div className="card-padded h-full hover:shadow-md transition-shadow">
                <div className="font-semibold text-ink text-sm">{tile.name}</div>
                <div className="text-xs text-muted mt-1">{tile.description}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink mb-1">{ri.scorecardsTitle}</h2>
        <p className="text-xs text-muted mb-4">{ri.scorecardsSubtitle}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {domains.map((d) => (
            <Link key={d.glossaryId} href={`/reports/domain/${d.glossaryId}`}>
              <div className="card px-4 py-3 hover:shadow-md transition-shadow text-sm font-medium text-ink">{d.name}</div>
            </Link>
          ))}
          {domains.length === 0 && <div className="text-sm text-muted">{ri.noDomains}</div>}
        </div>
      </div>
    </div>
  );
}
