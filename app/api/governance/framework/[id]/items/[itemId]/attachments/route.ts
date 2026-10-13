import { listAttachments, addAttachment } from "@/lib/gov-attachment-handlers";

type Params = { params: { id: string; itemId: string } };
const target = (p: Params["params"]) => ({ docId: Number(p.id), itemId: Number(p.itemId) });

// The files and links of one roadmap milestone or deliverable.
export async function GET(_req: Request, { params }: Params) {
  return listAttachments(target(params));
}

export async function POST(req: Request, { params }: Params) {
  return addAttachment(req, target(params));
}
