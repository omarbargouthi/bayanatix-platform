import { addDpiaMeasure } from "@/lib/privacy/dpia";
import { respond, viewer } from "@/lib/privacy/dpia-http";

// POST { text, riskId?, ownerUserId?, dueDate? }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  return respond(await addDpiaMeasure(id, await req.json().catch(() => ({})), v.session));
}
