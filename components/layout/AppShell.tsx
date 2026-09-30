"use client";
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context";
import { LangProvider, useLang, type Lang } from "@/lib/lang-context";
import { ChatAssetContextProvider } from "@/lib/chat/chat-context";
import { Sidebar } from "./Sidebar";
import { ChatbotBubble } from "@/components/ui/ChatbotBubble";
import { LicenseBanner } from "./LicenseBanner";
import type { SessionUser } from "@/lib/types";
import type { DomainCode } from "@/lib/can";
import type { LicenseStatus } from "@/lib/license/types";

type DomainAccessMap = Partial<Record<DomainCode, "WRITE" | "READ" | "NONE">>;

function ShellGrid({ user, domainAccess, children, licenseStatus }: { user: SessionUser; domainAccess?: DomainAccessMap; children: React.ReactNode; licenseStatus?: LicenseStatus }) {
  const { isRtl } = useLang();
  return (
    // dir="rtl" on the flex container both reverses flex-item order (sidebar goes right)
    // AND cascades direction:rtl to all children so every page renders RTL text.
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="flex min-h-screen bg-canvas transition-all duration-300"
    >
      <Sidebar user={user} domainAccess={domainAccess} />
      <div className="flex flex-col min-w-0 flex-1">
        {licenseStatus && <LicenseBanner status={licenseStatus} />}
        {children}
      </div>
      <ChatbotBubble />
    </div>
  );
}

export function AppShell({ user, children, initialLang, domainAccess, licenseStatus }: { user: SessionUser; children: React.ReactNode; initialLang?: Lang; domainAccess?: DomainAccessMap; licenseStatus?: LicenseStatus }) {
  return (
    <LangProvider initialLang={initialLang}>
      <SidebarProvider>
        <ChatAssetContextProvider>
          <ShellGrid user={user} domainAccess={domainAccess} licenseStatus={licenseStatus}>{children}</ShellGrid>
        </ChatAssetContextProvider>
      </SidebarProvider>
    </LangProvider>
  );
}
