"use client";
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context";
import { LangProvider, useLang } from "@/lib/lang-context";
import { Sidebar } from "./Sidebar";
import { ChatbotBubble } from "@/components/ui/ChatbotBubble";
import type { SessionUser } from "@/lib/types";

function ShellGrid({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const { isRtl } = useLang();
  return (
    <div className={`flex min-h-screen bg-canvas transition-all duration-300 ${isRtl ? "flex-row-reverse" : ""}`}>
      <Sidebar user={user} />
      <div className="flex flex-col min-w-0 flex-1">{children}</div>
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
