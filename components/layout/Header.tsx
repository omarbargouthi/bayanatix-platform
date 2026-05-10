"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { IconBell, IconSearch, IconLogout, IconMenu, IconGlobe, IconHistory, IconCollaborate } from "./icons";
import { NotificationPanel } from "@/components/ui/NotificationPanel";
import { initials } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import type { SessionUser } from "@/lib/types";
import { useState, useEffect } from "react";

export type Crumb = { label: string; href?: string };

function HeaderIconBtn({
  onClick, label, badgeCount, children,
}: {
  onClick?: () => void;
  label: string;
  badgeCount?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="relative w-8 h-8 grid place-items-center rounded-md text-ink-soft hover:bg-canvas hover:text-brand-purple transition-colors"
    >
      {children}
      {badgeCount != null && badgeCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-brand-purple rounded-full ring-2 ring-white text-white text-[9px] font-bold flex items-center justify-center px-0.5">
          {badgeCount > 9 ? "9+" : badgeCount}
        </span>
      )}
    </button>
  );
}

export function Header({ crumbs, user }: { crumbs: Crumb[]; user: SessionUser }) {
  const router    = useRouter();
  const { toggle } = useSidebar();
  const [menuOpen, setMenuOpen]     = useState(false);
  const [notifOpen, setNotifOpen]   = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetch("/api/notifications/count")
      .then((r) => r.ok ? r.json() : { unread: 0 })
      .then((d) => setUnreadCount(d.unread ?? 0))
      .catch(() => {});
  }, [notifOpen]); // re-check after panel closes (user may have read notifications)

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
    <header className="sticky top-0 z-20 h-[60px] bg-white border-b border-line flex items-center gap-3 px-5">
      {/* Hamburger */}
      <button
        onClick={toggle}
        aria-label="Toggle sidebar"
        className="w-8 h-8 grid place-items-center rounded-md text-ink-soft hover:bg-canvas hover:text-brand-purple transition-colors shrink-0"
      >
        <IconMenu className="w-[18px] h-[18px]" />
      </button>

      {/* Breadcrumb */}
      <nav className="hidden sm:flex items-center gap-1.5 text-sm text-muted shrink-0">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5">
              {c.href && !last
                ? <Link href={c.href} className="hover:text-brand-purple transition-colors">{c.label}</Link>
                : <span className={last ? "text-ink font-semibold" : ""}>{c.label}</span>
              }
              {!last && <span className="text-line select-none">›</span>}
            </span>
          );
        })}
      </nav>

      {/* Search */}
      <div className="ml-3 flex-1 max-w-lg flex items-center gap-2 bg-canvas border border-line rounded-md px-3 py-2 hover:border-brand-purple/40 transition-colors">
        <IconSearch className="w-4 h-4 text-muted shrink-0" />
        <input
          className="bg-transparent border-0 outline-none text-sm text-ink placeholder:text-muted flex-1 min-w-0"
          placeholder="Search assets, schemas, tables, columns…"
        />
      </div>

      {/* Right actions: Language · Notification · History · Collaboration */}
      <div className="ml-auto flex items-center gap-1">
        {/* Language */}
        <button
          aria-label="Language"
          className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 border border-line rounded-md text-xs font-semibold text-ink-soft hover:border-brand-purple hover:text-brand-purple transition-colors select-none"
        >
          <IconGlobe className="w-3.5 h-3.5" />
          EN
        </button>

        {/* Notification */}
        <HeaderIconBtn label="Notifications" badgeCount={unreadCount} onClick={() => setNotifOpen(true)}>
          <IconBell className="w-[17px] h-[17px]" />
        </HeaderIconBtn>

        {/* History */}
        <HeaderIconBtn label="Activity history">
          <IconHistory className="w-[17px] h-[17px]" />
        </HeaderIconBtn>

        {/* Collaboration */}
        <HeaderIconBtn label="Collaboration" onClick={() => router.push("/collaboration")}>
          <IconCollaborate className="w-[17px] h-[17px]" />
        </HeaderIconBtn>

        {/* Avatar + dropdown */}
        <div className="relative ml-1">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          >
            <Avatar initials={initials(user.fullName)} seed={user.userId} size={34} className="cursor-pointer" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-line rounded-md shadow-md py-1 z-50">
              <div className="px-3 py-2 border-b border-line">
                <div className="text-sm font-semibold text-ink">{user.fullName}</div>
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
                Asset Requests
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
      </div>
    </header>
    <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  );
}
