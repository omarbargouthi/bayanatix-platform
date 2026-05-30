import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { listGovDocs } from "@/lib/queries/gov-framework";
import { FrameworkSectionClient } from "@/components/governance/FrameworkSectionClient";

export const dynamic = "force-dynamic";

const VALID_SECTIONS = new Set(["policy","process","strategy","roadmap","standard","training","regulatory"]);

// English labels for breadcrumbs (server-side only)
const SECTION_EN_LABEL: Record<string, string> = {
  policy:     "Policies",
  process:    "Processes",
  strategy:   "Strategy",
  roadmap:    "Roadmap",
  standard:   "Standards & Guidelines",
  training:   "Training Material",
  regulatory: "Regulatory",
};

export default async function FrameworkSectionPage({ params }: { params: { section: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const key = params.section.toLowerCase();
  if (!VALID_SECTIONS.has(key)) notFound();

  const sectionCode = key.toUpperCase();
  const docs = await listGovDocs(sectionCode);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat",             href: "/dashboard" },
          { label: "Data Governance",     href: "/governance" },
          { label: "Governance Framework",href: "/governance/framework" },
          { label: SECTION_EN_LABEL[key] },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <FrameworkSectionClient
          sectionCode={sectionCode}
          initialDocs={docs}
          userId={user.userId}
        />
      </main>
    </>
  );
}
