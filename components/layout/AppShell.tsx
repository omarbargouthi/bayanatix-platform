"use client";
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context";
import { LangProvider, useLang } from "@/lib/lang-context";
import { Sidebar } from "./Sidebar";
import { ChatbotBubble } from "@/components/ui/ChatbotBubble";
import type { SessionUser } from "@/lib/types";

function ShellGrid({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const { isRtl } = useLang();
  return (
    // dir="rtl" on the flex container both reverses flex-item order (sidebar goes right)
    // AND cascades direction:rtl to all children so every page renders RTL text.
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="flex min-h-screen bg-canvas transition-all duration-300"
    >
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
