"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import { IconTable, IconLock, IconReports, IconFlag, IconCog } from "@/components/layout/icons";

export function QuickLinksWidget({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useLang();
  const h = t.homepage;
  const links = [
    { href: "/catalog", label: h.quickLinks.catalog, Icon: IconTable },
    { href: "/classification", label: h.quickLinks.classification, Icon: IconLock },
    { href: "/reports", label: h.quickLinks.reports, Icon: IconReports },
    { href: "/requests", label: h.quickLinks.requests, Icon: IconFlag },
    ...(isAdmin ? [{ href: "/admin", label: h.quickLinks.admin, Icon: IconCog }] : []),
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {links.map((l) => (
        <Link key={l.href} href={l.href}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-line hover:border-brand-purple/40 hover:bg-brand-purple/5 transition-colors">
          <l.Icon className="w-4 h-4 text-brand-purple shrink-0" />
          <span className="text-[12px] font-medium text-ink truncate">{l.label}</span>
        </Link>
      ))}
    </div>
  );
}
