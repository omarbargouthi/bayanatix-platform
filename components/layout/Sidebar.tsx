"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { initials } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import { useLang } from "@/lib/lang-context";
import type { SessionUser } from "@/lib/types";
import {
  IconDashboard, IconHome, IconReports, IconCircle, IconBook, IconCheck, IconLines,
  IconLock, IconShare, IconChat, IconCog, IconHelp, IconShield, IconHistory, IconFlag, IconAI,
  IconTable,
} from "./icons";

// AI Enrichment reuses the existing IconAI (same glyph as the AI Governance nav item) —
// the two live in different sidebar sections so there's no visual ambiguity.

type Item = {
  href:   string;
  label:  string;
  Icon:   React.ComponentType<{ className?: string }>;
  badge?: number;
};

// ── Static item definitions (labels overridden at runtime via i18n) ───────────
const NAV_TOP_DEF = [
  { href: "/dashboard", key: "dashboard" as const, Icon: IconDashboard },
  { href: "/homepage",  key: "homepage"  as const, Icon: IconHome },
  { href: "/reports",   key: "reports"   as const, Icon: IconReports },
];

const NAV_DOMAINS_DEF = [
  { href: "/governance",     key: "governance"    as const, Icon: IconCircle },
  { href: "/catalog",        key: "catalog"       as const, Icon: IconBook },
  { href: "/quality",        key: "quality"       as const, Icon: IconCheck },
  { href: "/classification", key: "classification"as const, Icon: IconLines },
  { href: "/column-types",   key: "columnTypes"   as const, Icon: IconTable },
  { href: "/enrichment",     key: "enrichment"    as const, Icon: IconAI },
  { href: "/privacy",        key: "privacy"       as const, Icon: IconLock },
  { href: "/sharing",        key: "sharing"       as const, Icon: IconShare },
  { href: "/open-data",      key: "openData"      as const, Icon: IconFlag },
  { href: "/foi",            key: "foi"           as const, Icon: IconChat },
];

const NAV_STANDALONE_DEF = [
  { href: "/ai-governance",  key: "aiGovernance"  as const, Icon: IconAI },
];

const NAV_ADMIN_DEF = [
  { href: "/admin/user-management",      key: "userManagement"      as const, Icon: IconShield },
  { href: "/admin/workflows",            key: "workflows"           as const, Icon: IconLines },
  { href: "/admin/sources",             key: "dataSources"          as const, Icon: IconShare },
  { href: "/admin/audit-logs",          key: "auditLogs"            as const, Icon: IconHistory },
  { href: "/admin/configuration",       key: "configuration"        as const, Icon: IconCog },
  { href: "/admin/ai-providers",        key: "aiProviders"          as const, Icon: IconAI },
  { href: "/admin/maturity-index-setup", key: "maturityIndexSetup"  as const, Icon: IconBook },
];

export function Sidebar({ user }: { user: SessionUser }) {
  const { collapsed } = useSidebar();
  const { t, lang, setLang, isRtl, secondaryLangDef } = useLang();
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // Build i18n-resolved item arrays
  const NAV_TOP: Item[] = NAV_TOP_DEF.map((d) => ({ href: d.href, label: t.nav[d.key], Icon: d.Icon }));

  const NAV_DOMAINS: Item[] = NAV_DOMAINS_DEF.map((d) => ({
    href: d.href, label: t.nav[d.key], Icon: d.Icon, badge: (d as { badge?: number }).badge,
  }));

  const NAV_STANDALONE: Item[] = NAV_STANDALONE_DEF.map((d) => ({ href: d.href, label: t.nav[d.key], Icon: d.Icon }));

  const NAV_ADMIN: Item[] = NAV_ADMIN_DEF.map((d) => ({ href: d.href, label: t.nav[d.key], Icon: d.Icon }));

  const borderSide = isRtl ? "border-l border-line" : "border-r border-line";

  return (
    <aside
      style={{ width: collapsed ? 64 : 240 }}
      className={`sticky top-0 h-screen shrink-0 z-30 flex flex-col bg-white overflow-hidden transition-all duration-300 ${borderSide}`}
    >

      {/* User section */}
      <div className={`flex items-center border-b border-line py-4 ${collapsed ? "justify-center px-2" : "gap-3 px-4"}`}>
        <Avatar initials={initials(user.fullName)} seed={user.userId} size={36} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold text-brand-deep text-sm truncate">{user.fullName}</div>
            <div className="text-[11px] text-muted">{t.roles[user.role] ?? user.role}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto nice-scroll py-3 flex flex-col gap-0.5 px-2.5">
        {NAV_TOP.map((it) => (
          <NavLink key={it.href} item={it} active={isActive(it.href)} collapsed={collapsed} isRtl={isRtl} />
        ))}

        {collapsed
          ? <div className="my-2 mx-1 border-t border-line" />
          : <div className="px-3 pt-3 pb-1 text-[10px] tracking-[0.12em] uppercase text-muted font-semibold">
              {t.nav.sectionDomains}
            </div>
        }

        {NAV_DOMAINS.map((it) => (
          <NavLink key={it.href} item={it} active={isActive(it.href)} collapsed={collapsed} isRtl={isRtl} />
        ))}

        {/* Standalone domain section */}
        {collapsed
          ? <div className="my-2 mx-1 border-t border-line" />
          : <div className="px-3 pt-3 pb-1 text-[10px] tracking-[0.12em] uppercase text-muted font-semibold">
              {t.nav.sectionStandalone}
            </div>
        }
        {NAV_STANDALONE.map((it) => (
          <NavLink key={it.href} item={it} active={isActive(it.href)} collapsed={collapsed} isRtl={isRtl} />
        ))}

        {user.role === "ADMIN" && (
          <>
            {collapsed
              ? <div className="my-2 mx-1 border-t border-line" />
              : <div className="px-3 pt-3 pb-1 text-[10px] tracking-[0.12em] uppercase text-muted font-semibold">
                  {t.nav.sectionAdmin}
                </div>
            }
            {collapsed ? (
              <NavLink
                item={{ href: "/admin/user-management", label: t.nav.userManagement, Icon: IconShield }}
                active={isActive("/admin")}
                collapsed={collapsed}
                isRtl={isRtl}
              />
            ) : (
              <>
                {NAV_ADMIN.map((it) => (
                  <NavLink key={it.href} item={it} active={isActive(it.href)} collapsed={false} indent isRtl={isRtl} />
                ))}
              </>
            )}
          </>
        )}
      </nav>

      {/* Bottom */}
      <div className="border-t border-line px-2.5 py-3">
        <NavLink item={{ href: "/support",  label: t.nav.support,  Icon: IconHelp }} active={isActive("/support")}  collapsed={collapsed} isRtl={isRtl} />
        <NavLink item={{ href: "/settings", label: t.nav.settings, Icon: IconCog  }} active={isActive("/settings")} collapsed={collapsed} isRtl={isRtl} />

        {/* Language toggle */}
        <button
          onClick={() => setLang(lang === "en" ? secondaryLangDef.code : "en")}
          title={lang === "en" ? `Switch to ${secondaryLangDef.displayName}` : "Switch to English"}
          className={`w-full mt-1 flex items-center gap-2 py-1.5 rounded-md text-sm font-semibold transition-colors
            ${collapsed ? "justify-center px-2" : "px-3"}
            ${lang !== "en" ? "bg-brand-purple/10 text-brand-purple" : "text-ink-soft hover:bg-canvas hover:text-brand-deep"}`}
        >
          <GlobeIcon />
          {!collapsed && (
            <span className="text-[13px]">
              {lang === "en" ? secondaryLangDef.nativeName : "English"}
            </span>
          )}
        </button>

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

function NavLink({ item, active, collapsed, indent, isRtl }: {
  item: Item; active: boolean; collapsed: boolean; indent?: boolean; isRtl?: boolean;
}) {
  const { Icon } = item;
  // Active indicator: left-side bar in LTR, right-side bar in RTL
  const activeShadow = isRtl
    ? "shadow-[inset_-3px_0_0_#6058A0]"
    : "shadow-[inset_3px_0_0_#6058A0]";

  const indentClass = isRtl
    ? indent ? "pr-7 pl-3" : "px-3"
    : indent ? "pl-7 pr-3" : "px-3";

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={[
        "flex items-center gap-2.5 py-1.5 rounded-md text-sm font-medium transition-colors",
        collapsed ? "justify-center px-2" : indentClass,
        active
          ? `bg-brand-purple/10 text-brand-deep ${activeShadow}`
          : "text-ink-soft hover:bg-canvas hover:text-brand-deep",
      ].join(" ")}
    >
      <Icon className={["w-[15px] h-[15px] shrink-0", active ? "text-brand-purple" : ""].join(" ")} />
      {!collapsed && <span className="flex-1 text-[13px]">{item.label}</span>}
      {!collapsed && item.badge ? (
        <span className="bg-brand-purple text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-[15px] h-[15px] shrink-0">
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM2.04 4.326c.325 1.329 2.532 2.54 3.717 3.19.48.263.793.434.743.484-.08.08-.162.158-.242.234-.416.396-.787.749-.758 1.266.035.634.618.824 1.214 1.017.577.188 1.168.38 1.286.983.082.417-.075.988-.22 1.52-.215.782-.406 1.48.22 1.48 1.5-.5 3.798-3.186 4-5 .138-1.243-2-2-3.5-2.5-.478-.16-.755.081-.99.284-.172.15-.322.279-.51.216-.445-.148-2.615-2.133-1.626-3.554l.127-.179c.333-.46.728-1.006-.296-1.006-.72.001-1.595.515-2.283 1.57l-.083.131z"/>
    </svg>
  );
}
