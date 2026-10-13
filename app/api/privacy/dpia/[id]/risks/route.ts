import { addDpiaRisks } from "@/lib/privacy/dpia";
import { respond, viewer } from "@/lib/privacy/dpia-http";

// POST { items: [{ title, description?, inherentLikelihood, inherentSeverity, sourceFlag? }] }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  const b = await req.json().catch(() => ({}));
  return respond(await addDpiaRisks(id, Array.isArray(b.items) ? b.items : [], v.session));
}
