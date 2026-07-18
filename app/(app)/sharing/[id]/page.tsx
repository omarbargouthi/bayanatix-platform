import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { DsaEditor } from "@/components/sharing/DsaEditor";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

export default async function DsaPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const canClassify = await canEditMetadata(session);

  return (
    <DsaEditor
      dsaId={params.id === "new" ? null : Number(params.id)}
      canClassify={canClassify}
    />
  );
}
