"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { IconBell, IconSearch, IconLogout, IconMenu, IconGlobe, IconHistory, IconCollaborate } from "./icons";
import { NotificationPanel } from "@/components/ui/NotificationPanel";
import { initials } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import { useLang } from "@/lib/lang-context";
import type { SessionUser } from "@/lib/types";
import type { SearchResult } from "@/app/api/catalog/search/route";
import { ALL_TYPES } from "@/lib/search-types";
import { useState, useEffect, useRef, useCallback } from "react";

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

export function Header({ crumbs, user, contextTypes }: { crumbs: Crumb[]; user: SessionUser; contextTypes?: string[] }) {
  const router    = useRouter();
  const { toggle } = useSidebar();
  const { lang, setLang, isRtl, secondaryLangDef } = useLang();
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Global search state
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [quickTypes,    setQuickTypes]    = useState<Set<string>>(
    new Set(contextTypes && contextTypes.length > 0 ? contextTypes : ALL_TYPES)
  );
  const searchRef   = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const r = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}`);
      if (r.ok) setSearchResults(await r.json());
    } finally { setSearchLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(searchQuery), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, runSearch]);

  function submitSearch() {
    if (!searchQuery.trim()) return;
    setSearchFocused(false);
    const params = new URLSearchParams({ q: searchQuery.trim() });
    if (quickTypes.size < ALL_TYPES.length) params.set("types", [...quickTypes].join(","));
    router.push(`/search?${params.toString()}`);
  }

  function toggleQuickType(type: string) {
    const next = new Set(quickTypes);
    if (next.has(type)) { if (next.size > 1) next.delete(type); } else { next.add(type); }
    setQuickTypes(next);
  }

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

      {/* Global search */}
      <div className={`${isRtl ? "mr-3" : "ml-3"} flex-1 max-w-lg relative`}>
        <div className={`flex items-center gap-2 bg-canvas border rounded-md px-3 py-2 transition-colors ${searchFocused ? "border-brand-purple ring-1 ring-brand-purple/20" : "border-line hover:border-brand-purple/40"}`}>
          <IconSearch className="w-4 h-4 text-muted shrink-0" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
            className="bg-transparent border-0 outline-none text-sm text-ink placeholder:text-muted flex-1 min-w-0"
            placeholder="Search assets, schemas, tables, columns…"
          />
          {searchQuery && (
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="text-muted hover:text-ink text-base leading-none">×</button>
          )}
        </div>

        {/* Results dropdown */}
        {searchFocused && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-lg z-50 overflow-hidden">
            {/* Quick type filter chips */}
            <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-line-soft bg-canvas-soft">
              {[
                { key: "TABLE",  label: "Tables" },
                { key: "VIEW",   label: "Views" },
                { key: "COLUMN", label: "Columns" },
                { key: "SCHEMA", label: "Schemas" },
                { key: "SOURCE", label: "Sources" },
                { key: "TERM",   label: "Terms" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleQuickType(key)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                    quickTypes.has(key)
                      ? "bg-brand-purple text-white border-brand-purple"
                      : "bg-white text-ink-soft border-line hover:border-brand-purple hover:text-brand-purple"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search results */}
            {searchQuery.length >= 2 && (
              <div className="max-h-64 overflow-y-auto">
                {searchLoading && <div className="px-4 py-3 text-sm text-muted">Searching…</div>}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="px-4 py-3 text-sm text-muted">No results for "{searchQuery}"</div>
                )}
                {searchResults.map((r) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setSearchFocused(false); setSearchQuery(""); router.push(r.href); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-canvas text-left border-b border-line-soft last:border-b-0 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-ink truncate">{r.name}</span>
                        <span className="text-[10px] text-muted bg-canvas-soft px-1.5 py-0.5 rounded shrink-0">{r.type}</span>
                      </div>
                      {r.meta && <div className="text-[11px] text-muted truncate">{r.meta}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* See all results link */}
            {searchQuery.length >= 2 && !searchLoading && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={submitSearch}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold text-brand-purple hover:bg-canvas border-t border-line-soft transition-colors"
              >
                See all results for "{searchQuery}"
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M2 8a.75.75 0 01.75-.75h8.69L8.22 4.03a.75.75 0 011.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06l3.22-3.22H2.75A.75.75 0 012 8z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right actions: Language · Notification · History · Collaboration */}
      <div className={`${isRtl ? "mr-auto" : "ml-auto"} flex items-center gap-1`}>
        {/* Language */}
        <button
          onClick={() => setLang(lang === "en" ? secondaryLangDef.code : "en")}
          aria-label="Toggle language"
          className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 border rounded-md text-xs font-semibold transition-colors select-none
            ${lang !== "en"
              ? "border-brand-purple text-brand-purple bg-brand-purple/5"
              : "border-line text-ink-soft hover:border-brand-purple hover:text-brand-purple"}`}
        >
          <IconGlobe className="w-3.5 h-3.5" />
          {lang === "en" ? secondaryLangDef.nativeName : "English"}
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
