"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { IconBell, IconHelp, IconSearch, IconLogout } from "./icons";
import { initials } from "@/lib/utils";
import type { SessionUser } from "@/lib/types";
import { useState } from "react";

export type Crumb = { label: string; href?: string };

export function Header({ crumbs, user }: { crumbs: Crumb[]; user: SessionUser }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 h-[72px] bg-white border-b border-line flex items-center gap-4 px-7">
      <nav className="flex items-center gap-2 text-sm text-muted">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} className="flex items-center gap-2">
              {c.href && !last ? (
                <Link href={c.href} className="hover:text-brand-purple transition-colors">{c.label}</Link>
              ) : (
                <span className={last ? "text-ink font-semibold" : ""}>{c.label}</span>
              )}
              {!last && <span className="text-line">›</span>}
            </span>
          );
        })}
      </nav>

      <div className="ml-6 flex-1 max-w-xl flex items-center gap-2.5 bg-canvas border border-line rounded-md px-3.5 py-2">
        <IconSearch className="w-4 h-4 text-muted" />
        <input
          className="bg-transparent border-0 outline-none text-sm text-ink placeholder:text-muted flex-1"
          placeholder="Search assets, schemas, tables, columns…"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 border border-line rounded-md text-xs font-semibold text-ink-soft">
          EN ▾
        </span>
        <button className="w-9 h-9 grid place-items-center rounded-md text-ink-soft hover:bg-canvas">
          <IconHelp className="w-[18px] h-[18px]" />
        </button>
        <button className="relative w-9 h-9 grid place-items-center rounded-md text-ink-soft hover:bg-canvas">
          <IconBell className="w-[18px] h-[18px]" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-brand-purple rounded-full ring-2 ring-white" />
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          >
            <Avatar initials={initials(user.fullName)} seed={user.userId} size={36} className="cursor-pointer" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-line rounded-md shadow-md py-1 z-50">
              <div className="px-3 py-2 border-b border-line">
                <div className="text-sm font-semibold text-ink">{user.fullName}</div>
                <div className="text-xs text-muted truncate">{user.email}</div>
              </div>
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
  );
}
