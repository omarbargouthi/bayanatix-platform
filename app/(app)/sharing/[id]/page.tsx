import { DsaEditor } from "@/components/sharing/DsaEditor";

type Props = { params: { id: string } };

export default function DsaPage({ params }: Props) {
  return <DsaEditor dsaId={params.id === "new" ? null : Number(params.id)} />;
}
