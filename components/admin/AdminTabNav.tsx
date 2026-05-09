"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/users",     label: "Users" },
  { href: "/admin/roles",     label: "Roles" },
  { href: "/admin/teams",     label: "Teams" },
  { href: "/admin/tags",      label: "Tags" },
  { href: "/admin/audit-log", label: "Audit Log" },
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
