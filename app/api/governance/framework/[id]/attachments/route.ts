import { listAttachments, addAttachment } from "@/lib/gov-attachment-handlers";

type Params = { params: { id: string } };
const target = (p: Params["params"]) => ({ docId: Number(p.id), itemId: null });

// The attachments of one Governance Framework document (files and links). The files
// themselves are served by [attId]/route.ts.
export async function GET(_req: Request, { params }: Params) {
  return listAttachments(target(params));
}

export async function POST(req: Request, { params }: Params) {
  return addAttachment(req, target(params));
}
