"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { initials } from "@/lib/utils";
import type { SessionUser } from "@/lib/types";
import {
  IconDashboard, IconHome, IconReports, IconCircle, IconBook, IconCheck, IconLines,
  IconLock, IconShare, IconChat, IconCog, IconHelp,
} from "./icons";

type Item = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

const NAV_TOP: Item[] = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/homepage", label: "Homepage", Icon: IconHome },
  { href: "/reports",  label: "Reports",   Icon: IconReports },
];

const NAV_DOMAINS: Item[] = [
  { href: "/governance",    label: "Data Governance", Icon: IconCircle },
  { href: "/catalog",       label: "Data Catalog",    Icon: IconBook },
  { href: "/quality",       label: "Data Quality",    Icon: IconCheck },
  { href: "/classification",label: "Classification",  Icon: IconLines },
  { href: "/privacy",       label: "Data Privacy",    Icon: IconLock },
  { href: "/sharing",       label: "Data Sharing",    Icon: IconShare },
  { href: "/foi",           label: "FOI Requests",    Icon: IconChat, badge: 3 },
  { href: "/ai-governance", label: "AI Governance",   Icon: IconCog },
];

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sticky top-0 h-screen w-60 shrink-0 z-30 flex flex-col bg-gradient-to-b from-sidebar to-[#181840] text-white/80">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/5">
        <Avatar initials={initials(user.fullName)} seed={user.userId} size={36} />
        <div className="min-w-0">
          <div className="font-semibold text-white text-sm truncate">{user.fullName}</div>
          <div className="text-[11px] text-white/50">{prettyRole(user.role)}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto nice-scroll px-2.5 py-3 flex flex-col gap-0.5">
        {NAV_TOP.map((it) => (
          <NavLink key={it.href} item={it} active={isActive(it.href)} />
        ))}
        <div className="px-3 pt-3 pb-1 text-[11px] tracking-[0.12em] uppercase text-white/40 font-semibold">
          Domains
        </div>
        {NAV_DOMAINS.map((it) => (
          <NavLink key={it.href} item={it} active={isActive(it.href)} />
        ))}
      </nav>

      <div className="border-t border-white/5 px-2.5 py-3">
        <NavLink item={{ href: "/support", label: "Support", Icon: IconHelp }} active={isActive("/support")} />
        <NavLink item={{ href: "/settings", label: "Settings", Icon: IconCog }} active={isActive("/settings")} />
        <div className="flex items-center gap-2 px-3 py-3 mt-1 border-t border-white/5">
          <img src="/logo.svg" alt="" className="w-5 h-6" />
          <span className="text-xs font-bold tracking-[0.16em] text-white/85">BAYANATIX</span>
        </div>
      </div>
    </aside>
  );
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      className={
        "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors " +
        (active
          ? "bg-gradient-to-r from-brand-purple/55 to-brand-purple/20 text-white shadow-[inset_3px_0_0_#81B4E1]"
          : "text-white/70 hover:bg-white/5 hover:text-white")
      }
    >
      <Icon className="w-[18px] h-[18px] opacity-90" />
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <span className="bg-brand-purple text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function prettyRole(role: SessionUser["role"]) {
  switch (role) {
    case "ADMIN":   return "Administrator";
    case "STEWARD": return "Data Steward";
    case "OFFICER": return "Compliance Officer";
    default:        return "Viewer";
  }
}
