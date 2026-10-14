"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { initials } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import { useLang } from "@/lib/lang-context";
import { LanguagePicker } from "./LanguagePicker";
import { EnvironmentBadge } from "./EnvironmentBadge";
import type { SessionUser } from "@/lib/types";
import {
  IconDashboard, IconHome, IconReports, IconCircle, IconBook, IconCheck, IconLines,
  IconLock, IconShare, IconChat, IconCog, IconShield, IconHistory, IconFlag, IconAI,
  IconBulk, IconGlossary, IconDB, IconLineage, IconLogout, IconUserPlus, IconTag, IconCollaborate,
} from "./icons";

type Item = {
  href:   string;
  label:  string;
  Icon:   React.ComponentType<{ className?: string }>;
  badge?: number;
};

type Child = Item & { exact?: boolean };

// Which menu groups the user has expanded, remembered in this browser only.
const OPEN_GROUPS_KEY = "bayanatix_nav_open";

// ── Static item definitions (labels overridden at runtime via i18n) ───────────
const NAV_TOP_DEF = [
  { href: "/dashboard",  key: "dashboard"    as const, Icon: IconDashboard },
  { href: "/homepage",   key: "homepage"     as const, Icon: IconHome },
  { href: "/reports",    key: "reports"      as const, Icon: IconReports },
  { href: "/enrichment", key: "enrichment"   as const, Icon: IconAI },
  { href: "/assets",     key: "customAssets" as const, Icon: IconGlossary },
  { href: "/request-access", key: "requestAccess" as const, Icon: IconUserPlus },
];

// domain: which DomainCode gates this nav item (see lib/can.ts) — omitted for
// Catalog/Classification, which stay open to every logged-in user.
const NAV_DOMAINS_DEF = [
  { href: "/governance",     key: "governance"    as const, Icon: IconCircle, domain: "GOVERNANCE" as const },
  { href: "/catalog",        key: "catalog"       as const, Icon: IconBook },
  { href: "/quality",        key: "quality"       as const, Icon: IconCheck, domain: "DATA_QUALITY" as const },
  { href: "/classification", key: "classification"as const, Icon: IconLines },
  { href: "/privacy",        key: "privacy"       as const, Icon: IconLock, domain: "DATA_PRIVACY" as const },
  { href: "/sharing",        key: "sharing"       as const, Icon: IconShare, domain: "SHARING" as const },
  { href: "/open-data",      key: "openData"      as const, Icon: IconFlag, domain: "OPEN_DATA" as const },
  { href: "/foi",            key: "foi"           as const, Icon: IconChat, domain: "FOI" as const },
];

const NAV_ADMIN_DEF = [
  { href: "/admin/user-management",      key: "userManagement"      as const, Icon: IconShield },
  { href: "/admin/tags",                 key: "tags"                as const, Icon: IconTag },
  { href: "/bulk-operations",            key: "bulkOperations"      as const, Icon: IconBulk },
  { href: "/admin/workflows",            key: "workflows"           as const, Icon: IconLines },
  { href: "/admin/sources",             key: "dataSources"          as const, Icon: IconShare },
  { href: "/admin/audit-logs",          key: "auditLogs"            as const, Icon: IconHistory },
  { href: "/admin/configuration",       key: "configuration"        as const, Icon: IconCog },
  { href: "/admin/ai-providers",        key: "aiProviders"          as const, Icon: IconAI },
  { href: "/admin/maturity-index-setup", key: "maturityIndexSetup"  as const, Icon: IconBook },
  { href: "/admin/reports-kpi",          key: "reportsKpi"          as const, Icon: IconReports },
  { href: "/admin/custom-assets",        key: "customAssetTypes"    as const, Icon: IconDB },
];

export function Sidebar({ user, domainAccess }: { user: SessionUser; domainAccess?: Partial<Record<string, "WRITE" | "READ" | "NONE">> }) {
  const { collapsed } = useSidebar();
  const { t, isRtl } = useLang();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasCustomerLogo, setHasCustomerLogo] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? "[]");
      if (Array.isArray(saved)) setOpenGroups((g) => Array.from(new Set([...g, ...saved])));
    } catch {}
  }, []);

  function toggleGroup(href: string) {
    setOpenGroups((g) => {
      const next = g.includes(href) ? g.filter((h) => h !== href) : [...g, href];
      try { localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  useEffect(() => {
    fetch("/api/admin/branding")
      .then(r => r.ok ? r.json() : null)
      .then(d => setHasCustomerLogo(!!d?.hasCustomLogo))
      .catch(() => {});
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  // Build i18n-resolved item arrays
  const NAV_TOP: Item[] = NAV_TOP_DEF.map((d) => ({ href: d.href, label: t.nav[d.key], Icon: d.Icon }));

  // Hide nav items for domains the user has no grant on (ADMIN's domainAccess
  // entries are always "WRITE", see getDomainAccess) — Catalog/Classification
  // have no `domain` field and stay visible to everyone.
  const NAV_DOMAINS: Item[] = NAV_DOMAINS_DEF
    .filter((d) => {
      const domain = (d as { domain?: string }).domain;
      return !domain || (domainAccess?.[domain] ?? "NONE") !== "NONE";
    })
    .map((d) => ({
      href: d.href, label: t.nav[d.key], Icon: d.Icon, badge: (d as { badge?: number }).badge,
    }));

  const NAV_ADMIN: Item[] = NAV_ADMIN_DEF.map((d) => ({ href: d.href, label: t.nav[d.key], Icon: d.Icon }));

  // Data Catalog sub-menu: each opens its own view (assets overview, glossaries,
  // lineage graph + mapping register). Lineage used to sit under Administration,
  // which hid it — and its Excel import — from stewards.
  const CATALOG_CHILDREN: Child[] = [
    { href: "/catalog",  label: t.nav.catalogAssets,     Icon: IconDB },
    { href: "/glossary", label: t.nav.catalogGlossaries, Icon: IconGlossary },
    { href: "/lineage",  label: t.nav.lineage,           Icon: IconLineage },
  ];

  // Data Privacy sub-menu. Data Retention lives at /privacy itself, so it is active only
  // there, not on the pages below it. Data subject requests are for admins, data
  // protection officers and stewards (the same rule as the page).
  const seesDsr = user.role === "ADMIN" || user.role === "OFFICER" || user.role === "STEWARD";
  const PRIVACY_CHILDREN: Child[] = [
    { href: "/privacy",          label: t.nav.privacyRetention, Icon: IconHistory, exact: true },
    ...(seesDsr ? [{ href: "/privacy/requests", label: t.nav.privacyRequests, Icon: IconCollaborate }] : []),
    { href: "/privacy/dpia",     label: t.nav.privacyDpia,      Icon: IconShield },
  ];
  const childActive = (c: Child) => (c.exact ? pathname === c.href : isActive(c.href));

  // Menu items with sub-pages expand and collapse. A group holding the current page
  // opens by itself, so the page's own entry is always visible.
  const GROUPS: Record<string, Child[]> = { "/catalog": CATALOG_CHILDREN, "/privacy": PRIVACY_CHILDREN };
  const activeGroup = Object.keys(GROUPS).find((g) => GROUPS[g].some(childActive));
  useEffect(() => {
    if (activeGroup) setOpenGroups((g) => (g.includes(activeGroup) ? g : [...g, activeGroup]));
  }, [activeGroup]);

  const borderSide = isRtl ? "border-l border-line" : "border-r border-line";

  return (
    <aside
      style={{ width: collapsed ? 64 : 240 }}
      className={`sticky top-0 h-screen shrink-0 z-30 flex flex-col bg-white overflow-hidden transition-all duration-300 ${borderSide}`}
    >

      {/* User section — the one place the profile menu lives (Header used to have
          its own separate copy in the top-right; that was a duplicate of this). */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          className={`w-full flex items-center border-b border-line py-4 transition-colors hover:bg-canvas ${collapsed ? "justify-center px-2" : "gap-3 px-4"}`}
        >
          <Avatar initials={initials(user.fullName)} seed={user.userId} colorCode={user.avatarColorCode} size={36} />
          {!collapsed && (
            <div className="min-w-0 text-left rtl:text-right">
              <div className="font-semibold text-brand-deep text-sm truncate">{user.fullName}</div>
              <div className="text-[11px] text-muted">{t.roles[user.role] ?? user.role}</div>
            </div>
          )}
        </button>
        {menuOpen && (
          // fixed (not absolute) so it isn't clipped by the sidebar's own
          // overflow-hidden (needed for the collapse-width transition) — this
          // matters especially in the collapsed 64px-wide state.
          <div className={`fixed top-[78px] ${isRtl ? "right-3" : "left-3"} w-56 bg-white border border-line rounded-md shadow-lg py-1 z-50`}>
            <div className="px-3 py-2 border-b border-line">
              <div className="text-sm font-semibold text-ink truncate">{user.fullName}</div>
              <div className="text-xs text-muted truncate">{user.email}</div>
            </div>
            <Link
              href="/profile"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMenuOpen(false)}
              className="w-full text-left px-3 py-2 text-sm text-ink-soft hover:bg-canvas flex items-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              My Profile
            </Link>
            <Link
              href="/requests"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMenuOpen(false)}
              className="w-full text-left px-3 py-2 text-sm text-ink-soft hover:bg-canvas flex items-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Requests
            </Link>
            <Link
              href="/about"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMenuOpen(false)}
              className="w-full text-left px-3 py-2 text-sm text-ink-soft hover:bg-canvas flex items-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-2.92 3-2.92 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Help &amp; About
            </Link>
            <div className="border-t border-line my-1" />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={logout}
              className="w-full text-left px-3 py-2 text-sm text-ink-soft hover:bg-canvas flex items-center gap-2"
            >
              <IconLogout className="w-4 h-4" /> Sign out
            </button>
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

        {NAV_DOMAINS.map((it) => GROUPS[it.href] ? (
          <div key={it.href}>
            {collapsed ? (
              <NavLink item={it} active={activeGroup === it.href} collapsed isRtl={isRtl} />
            ) : (
              <GroupToggle
                item={it}
                open={openGroups.includes(it.href)}
                holdsActive={activeGroup === it.href}
                isRtl={isRtl}
                onToggle={() => toggleGroup(it.href)}
              />
            )}
            {!collapsed && openGroups.includes(it.href) && (
              <div className={`mt-0.5 flex flex-col gap-0.5 ${isRtl ? "mr-4 border-r pr-1.5" : "ml-4 border-l pl-1.5"} border-line`}>
                {GROUPS[it.href].map((c) => (
                  <NavLink key={c.href} item={c} active={childActive(c)} collapsed={false} isRtl={isRtl} small />
                ))}
              </div>
            )}
          </div>
        ) : (
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
                  <NavLink key={it.href} item={it} active={isActive(it.href)} collapsed={false} isRtl={isRtl} />
                ))}
              </>
            )}
          </>
        )}
      </nav>

      {/* Bottom */}
      <div className="border-t border-line px-2.5 py-3">
        {/* Language picker */}
        <div className={`w-full mt-1 ${collapsed ? "flex justify-center" : ""}`}>
          <LanguagePicker
            collapsed={collapsed}
            dropUp
            triggerClassName={`w-full flex items-center gap-2 py-1.5 rounded-md text-sm font-semibold transition-colors ${collapsed ? "justify-center px-2" : "px-3"} text-ink-soft hover:bg-canvas hover:text-brand-deep`}
          />
        </div>

        <div className={`flex items-center mt-2 pt-3 border-t border-line ${collapsed ? "justify-center" : "gap-2 px-3"}`}>
          <img src="/logo.svg" alt="" className="w-5 h-6 shrink-0" />
          {!collapsed && (
            <span className="text-xs font-bold tracking-[0.16em] text-brand-deep/70">BAYANIS</span>
          )}
        </div>
        {!collapsed && hasCustomerLogo && (
          <div className="flex items-center gap-2 px-3 mt-1.5">
            <span className="text-[9px] text-muted uppercase tracking-wider shrink-0">for</span>
            <img src="/api/branding/logo" alt="Customer logo" className="h-5 max-w-[130px] object-contain object-left" />
          </div>
        )}
        {!collapsed && <EnvironmentBadge className="mx-3 mt-2" />}
      </div>
    </aside>
  );
}

/** The heading of a menu group: opens and closes its sub-pages. */
function GroupToggle({ item, open, holdsActive, isRtl, onToggle }: {
  item: Item; open: boolean; holdsActive: boolean; isRtl?: boolean; onToggle: () => void;
}) {
  const { Icon } = item;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={[
        "w-full flex items-center gap-2.5 py-1.5 px-3 rounded-md text-sm font-medium transition-colors text-start",
        holdsActive && !open ? "text-brand-deep bg-brand-purple/5" : "text-ink-soft hover:bg-canvas hover:text-brand-deep",
      ].join(" ")}
    >
      <Icon className={["w-[15px] h-[15px] shrink-0", holdsActive ? "text-brand-purple" : ""].join(" ")} />
      <span className="flex-1 text-[13px]">{item.label}</span>
      <svg
        viewBox="0 0 24 24"
        className="w-3.5 h-3.5 shrink-0 text-muted transition-transform"
        style={{ transform: open ? "none" : `rotate(${isRtl ? 90 : -90}deg)` }}
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

function NavLink({ item, active, collapsed, isRtl, small }: {
  item: Item; active: boolean; collapsed: boolean; isRtl?: boolean; small?: boolean;
}) {
  const { Icon } = item;
  // Active indicator: left-side bar in LTR, right-side bar in RTL
  const activeShadow = isRtl
    ? "shadow-[inset_-3px_0_0_#6058A0]"
    : "shadow-[inset_3px_0_0_#6058A0]";

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={[
        "flex items-center gap-2.5 py-1.5 rounded-md text-sm font-medium transition-colors",
        collapsed ? "justify-center px-2" : "px-3",
        active
          ? `bg-brand-purple/10 text-brand-deep ${activeShadow}`
          : "text-ink-soft hover:bg-canvas hover:text-brand-deep",
      ].join(" ")}
    >
      <Icon className={[small ? "w-[13px] h-[13px] shrink-0" : "w-[15px] h-[15px] shrink-0", active ? "text-brand-purple" : ""].join(" ")} />
      {!collapsed && <span className={`flex-1 ${small ? "text-[12.5px]" : "text-[13px]"}`}>{item.label}</span>}
      {!collapsed && item.badge ? (
        <span className="bg-brand-purple text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
