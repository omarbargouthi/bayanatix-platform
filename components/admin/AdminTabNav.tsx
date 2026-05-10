"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/user-management", label: "User Management" },
  { href: "/admin/workflows",       label: "Workflows" },
  { href: "/admin/sources",         label: "Data Sources" },
  { href: "/admin/audit-logs",      label: "Audit & Logs" },
  { href: "/admin/configuration",   label: "Configuration" },
];

export function AdminTabNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-line bg-white px-8">
      <nav className="flex items-center gap-0">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "text-brand-purple border-brand-purple"
                  : "text-ink-soft border-transparent hover:text-brand-deep hover:border-brand-purple"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
