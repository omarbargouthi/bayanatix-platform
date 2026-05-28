"use client";
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context";
import { LangProvider, useLang } from "@/lib/lang-context";
import { Sidebar } from "./Sidebar";
import { ChatbotBubble } from "@/components/ui/ChatbotBubble";
import type { SessionUser } from "@/lib/types";

function ShellGrid({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const { isRtl }     = useLang();
  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      style={{ gridTemplateColumns: collapsed ? "64px 1fr" : "240px 1fr" }}
      className="grid min-h-screen bg-canvas transition-all duration-300"
    >
      <Sidebar user={user} />
      <div className="flex flex-col min-w-0">{children}</div>
      <ChatbotBubble />
    </div>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <LangProvider>
      <SidebarProvider>
        <ShellGrid user={user}>{children}</ShellGrid>
      </SidebarProvider>
    </LangProvider>
  );
}
