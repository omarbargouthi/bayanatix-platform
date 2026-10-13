import { serveAttachment, editAttachment, removeAttachment } from "@/lib/gov-attachment-handlers";

type Params = { params: { id: string; itemId: string; attId: string } };
const target = (p: Params["params"]) => ({ docId: Number(p.id), itemId: Number(p.itemId) });

// One attachment of a roadmap milestone or deliverable: its stored file, its details, its removal.
export async function GET(req: Request, { params }: Params) {
  return serveAttachment(req, target(params), Number(params.attId));
}

export async function PATCH(req: Request, { params }: Params) {
  return editAttachment(req, target(params), Number(params.attId));
}

export async function DELETE(_req: Request, { params }: Params) {
  return removeAttachment(target(params), Number(params.attId));
}
