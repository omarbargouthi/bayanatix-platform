import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { SearchPageClient } from "@/components/search/SearchPageClient";

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

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Catalog", href: "/catalog" },
          { label: "Search" },
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
