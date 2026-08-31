import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getHomepageLayout } from "@/lib/queries/homepage";
import { ALL_WIDGET_KEYS, resolveWidgetKeys } from "@/lib/homepage/widget-meta";
import { fetchWidgetData } from "@/lib/homepage/widget-registry";
import { HomepageClient } from "./HomepageClient";

export const dynamic = "force-dynamic";

export default async function HomepagePage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const savedKeys = await getHomepageLayout(user.userId);
  const initialWidgetKeys = resolveWidgetKeys(savedKeys);

  // Fetch data for every catalog widget (not just enabled ones) so "Add Widget"
  // can render instantly client-side without a follow-up fetch/loading state.
  const entries = await Promise.all(
    ALL_WIDGET_KEYS.map(async (key) => [key, await fetchWidgetData(key, user.userId, user)] as const)
  );
  const widgetData = Object.fromEntries(entries);

  const firstName = user.fullName.split(" ")[0];

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: "Homepage" }]} user={user} />
      <HomepageClient firstName={firstName} initialWidgetKeys={initialWidgetKeys} widgetData={widgetData} />
    </>
  );
}
