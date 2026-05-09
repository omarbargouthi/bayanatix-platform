"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { initials } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import type { SessionUser } from "@/lib/types";
import {
  IconDashboard, IconHome, IconReports, IconCircle, IconBook, IconCheck, IconLines,
  IconLock, IconShare, IconChat, IconCog, IconHelp, IconGlossary, IconShield,
} from "./icons";

type Item = {
  href:   string;
  label:  string;
  Icon:   React.ComponentType<{ className?: string }>;
  badge?: number;
};

const NAV_TOP: Item[] = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/homepage",  label: "Homepage",  Icon: IconHome },
  { href: "/reports",   label: "Reports",   Icon: IconReports },
];

const NAV_DOMAINS: Item[] = [
  { href: "/governance",     label: "Data Governance", Icon: IconCircle },
  { href: "/catalog",        label: "Data Catalog",    Icon: IconBook },
  { href: "/glossary",       label: "Business Glossary", Icon: IconGlossary },
  { href: "/quality",        label: "Data Quality",    Icon: IconCheck },
  { href: "/classification", label: "Classification",  Icon: IconLines },
  { href: "/privacy",        label: "Data Privacy",    Icon: IconLock },
  { href: "/sharing",        label: "Data Sharing",    Icon: IconShare },
  { href: "/foi",            label: "FOI Requests",    Icon: IconChat, badge: 3 },
  { href: "/ai-governance",  label: "AI Governance",   Icon: IconCog },
];

export function Sidebar({ user }: { user: SessionUser }) {
  const { collapsed } = useSidebar();
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sticky top-0 h-screen shrink-0 z-30 flex flex-col bg-white border-r border-line overflow-hidden">

      {/* User section */}
      <div className={`flex items-center border-b border-line py-4 ${collapsed ? "justify-center px-2" : "gap-3 px-4"}`}>
        <Avatar initials={initials(user.fullName)} seed={user.userId} size={36} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold text-brand-deep text-sm truncate">{user.fullName}</div>
            <div className="text-[11px] text-muted">{prettyRole(user.role)}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto nice-scroll py-3 flex flex-col gap-0.5 px-2.5">
        {NAV_TOP.map((it) => (
          <NavLink key={it.href} item={it} active={isActive(it.href)} collapsed={collapsed} />
        ))}

        {collapsed
          ? <div className="my-2 mx-1 border-t border-line" />
          : <div className="px-3 pt-3 pb-1 text-[10px] tracking-[0.12em] uppercase text-muted font-semibold">Domains</div>
        }

        {NAV_DOMAINS.map((it) => (
          <NavLink key={it.href} item={it} active={isActive(it.href)} collapsed={collapsed} />
        ))}

        {user.role === "ADMIN" && (
          <>
            {collapsed
              ? <div className="my-2 mx-1 border-t border-line" />
              : <div className="px-3 pt-3 pb-1 text-[10px] tracking-[0.12em] uppercase text-muted font-semibold">Administration</div>
            }
            <NavLink
              item={{ href: "/admin/users", label: "User Management", Icon: IconShield }}
              active={isActive("/admin")}
              collapsed={collapsed}
            />
          </>
        )}
      </nav>

      {/* Bottom */}
      <div className="border-t border-line px-2.5 py-3">
        <NavLink item={{ href: "/support",  label: "Support",  Icon: IconHelp }} active={isActive("/support")}  collapsed={collapsed} />
        <NavLink item={{ href: "/settings", label: "Settings", Icon: IconCog  }} active={isActive("/settings")} collapsed={collapsed} />

        <div className={`flex items-center mt-2 pt-3 border-t border-line ${collapsed ? "justify-center" : "gap-2 px-3"}`}>
          <img src="/logo.svg" alt="" className="w-5 h-6 shrink-0" />
          {!collapsed && (
            <span className="text-xs font-bold tracking-[0.16em] text-brand-deep/70">BAYANATIX</span>
          )}
        </div>
      </div>
    </aside>
  );
}

function NavLink({ item, active, collapsed }: { item: Item; active: boolean; collapsed: boolean }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={[
        "flex items-center gap-2.5 py-2 rounded-md text-sm font-medium transition-colors",
        collapsed ? "justify-center px-2" : "px-3",
        active
          ? "bg-brand-purple/10 text-brand-deep shadow-[inset_3px_0_0_#6058A0]"
          : "text-ink-soft hover:bg-canvas hover:text-brand-deep",
      ].join(" ")}
    >
      <Icon className={["w-[18px] h-[18px] shrink-0", active ? "text-brand-purple" : ""].join(" ")} />
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {!collapsed && item.badge ? (
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
