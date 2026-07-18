import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { sql } from "@/lib/db";
import { DsaEditor } from "@/components/sharing/DsaEditor";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

export default async function DsaPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const isNew = params.id === "new";
  const dsaId = isNew ? null : Number(params.id);

  // Fetch title for breadcrumb (only for existing agreements)
  let titleText = "New Agreement";
  if (dsaId) {
    const [row] = await sql<{ title: string }[]>`
      SELECT title_text AS title FROM bayanat.data_sharing_agreements WHERE dsa_id = ${dsaId}
    `;
    if (row) titleText = row.title;
  }

  const canClassify = await canEditMetadata(session);

  const collabHref = `/collaboration?newTitle=${encodeURIComponent(`Re: ${titleText}`)}`;

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Data Sharing Agreements", href: "/sharing" },
          { label: titleText },
        ]}
        user={session}
        contextTypes={[]}
        collaborationHref={collabHref}
      />
      <main className="flex-1 flex flex-col min-h-0">
        <DsaEditor dsaId={dsaId} canClassify={canClassify} />
      </main>
    </>
  );
}
