import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { SearchPageClient } from "@/components/search/SearchPageClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: {
    q?: string; types?: string; tags?: string; owner?: string; classification?: string;
    status?: string; domain?: string; since?: string; dqDimension?: string; dsaScope?: string;
    customTypeCode?: string;
  };
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.catalog.pageTitle, href: "/catalog" },
          { label: t.common.search },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <Suspense fallback={<div className="h-10 w-48 bg-canvas-soft animate-pulse rounded-md" />}>
          <SearchPageClient initialParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
