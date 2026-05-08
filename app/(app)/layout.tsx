import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <div className="grid grid-cols-[240px_1fr] min-h-screen bg-canvas">
      <Sidebar user={user} />
      <div className="flex flex-col min-w-0">{children}</div>
    </div>
  );
}
