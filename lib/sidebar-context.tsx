"use client";
import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type Ctx = { collapsed: boolean; toggle: () => void };
const SidebarCtx = createContext<Ctx>({ collapsed: false, toggle: () => {} });
export const useSidebar = () => useContext(SidebarCtx);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <SidebarCtx.Provider value={{ collapsed, toggle: () => setCollapsed((v) => !v) }}>
      {children}
    </SidebarCtx.Provider>
  );
}
