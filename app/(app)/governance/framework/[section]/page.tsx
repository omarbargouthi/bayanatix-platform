import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { listGovDocs } from "@/lib/queries/gov-framework";
import { FrameworkSectionClient } from "@/components/governance/FrameworkSectionClient";

export const dynamic = "force-dynamic";

const SECTION_META: Record<string, { label: string; description: string }> = {
  policy:     { label: "Policies",               description: "Company policies enforced across the enterprise. Upload approved policies for employee reference." },
  process:    { label: "Processes",              description: "Documentation explaining how policies are implemented and enforced." },
  strategy:   { label: "Strategy",               description: "Endorsed data management strategies aligned to organisational objectives." },
  roadmap:    { label: "Roadmap",                description: "Approved data governance roadmaps showing planned initiatives." },
  standard:   { label: "Standards & Guidelines", description: "Technical and business standards and best practices." },
  training:   { label: "Training Material",      description: "Training resources and reference materials for staff." },
  regulatory: { label: "Regulatory",             description: "Regulatory and legal compliance documentation." },
};

export default async function FrameworkSectionPage({ params }: { params: { section: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const meta = SECTION_META[params.section.toLowerCase()];
  if (!meta) notFound();

  const sectionCode = params.section.toUpperCase();
  const docs = await listGovDocs(sectionCode);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Governance", href: "/governance" },
          { label: "Governance Framework", href: "/governance/framework" },
          { label: meta.label },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <FrameworkSectionClient
          sectionCode={sectionCode}
          sectionLabel={meta.label}
          sectionDescription={meta.description}
          initialDocs={docs}
          userId={user.userId}
        />
      </main>
    </>
  );
}
