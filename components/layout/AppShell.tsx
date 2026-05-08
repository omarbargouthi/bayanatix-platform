"use client";
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context";
import { Sidebar } from "./Sidebar";
import type { SessionUser } from "@/lib/types";

function ShellGrid({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      style={{ gridTemplateColumns: collapsed ? "64px 1fr" : "240px 1fr" }}
      className="grid min-h-screen bg-canvas transition-all duration-300"
    >
      <Sidebar user={user} />
      <div className="flex flex-col min-w-0">{children}</div>
    </div>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ShellGrid user={user}>{children}</ShellGrid>
    </SidebarProvider>
  );
}
