import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { StitchingReviewClient } from "./StitchingReviewClient";

export const dynamic = "force-dynamic";

export default async function StitchingReviewPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "STEWARD") redirect("/lineage");

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Lineage", href: "/lineage" },
          { label: "Stitching Review" },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <div className="mb-5">
          <h1 className="text-2xl font-extrabold text-brand-deep">Stitching Review</h1>
          <p className="text-sm text-muted mt-1">
            External references the scanners couldn&apos;t match to a registered connection. Bind them to the right connection or asset, or dismiss if there isn&apos;t one.
          </p>
        </div>
        <StitchingReviewClient />
      </main>
    </>
  );
}
