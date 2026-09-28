"use client";
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context";
import { LangProvider, useLang, type Lang } from "@/lib/lang-context";
import { ChatAssetContextProvider } from "@/lib/chat/chat-context";
import { Sidebar } from "./Sidebar";
import { ChatbotBubble } from "@/components/ui/ChatbotBubble";
import type { SessionUser } from "@/lib/types";
import type { DomainCode } from "@/lib/can";

type DomainAccessMap = Partial<Record<DomainCode, "WRITE" | "READ" | "NONE">>;

function ShellGrid({ user, domainAccess, children }: { user: SessionUser; domainAccess?: DomainAccessMap; children: React.ReactNode }) {
  const { isRtl } = useLang();
  return (
    // dir="rtl" on the flex container both reverses flex-item order (sidebar goes right)
    // AND cascades direction:rtl to all children so every page renders RTL text.
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="flex min-h-screen bg-canvas transition-all duration-300"
    >
      <Sidebar user={user} domainAccess={domainAccess} />
      <div className="flex flex-col min-w-0 flex-1">{children}</div>
      <ChatbotBubble />
    </div>
  );
}

export function AppShell({ user, children, initialLang, domainAccess }: { user: SessionUser; children: React.ReactNode; initialLang?: Lang; domainAccess?: DomainAccessMap }) {
  return (
    <LangProvider initialLang={initialLang}>
      <SidebarProvider>
        <ChatAssetContextProvider>
          <ShellGrid user={user} domainAccess={domainAccess}>{children}</ShellGrid>
        </ChatAssetContextProvider>
      </SidebarProvider>
    </LangProvider>
  );
}
