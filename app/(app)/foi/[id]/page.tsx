import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { CaseFile } from "@/components/foi/CaseFile";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

export default async function FoiCasePage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = Number(params.id);

  let refCode = "New Request";
  if (Number.isFinite(id)) {
    const [row] = await sql<{ ref: string }[]>`
      SELECT reference_code AS ref FROM bayanat.foi_requests WHERE foi_request_id = ${id}
    `;
    if (row) refCode = row.ref;
  }

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanatix", href: "/dashboard" },
          { label: "Freedom of Information", href: "/foi" },
          { label: refCode },
        ]}
        user={session}
        contextTypes={[]}
        collaborationHref={`/collaboration?newTitle=${encodeURIComponent('Re: FOI ' + refCode)}`}
      />
      <main className="flex-1 flex flex-col min-h-0">
        <CaseFile foiRequestId={id} currentUser={session} />
      </main>
    </>
  );
}
