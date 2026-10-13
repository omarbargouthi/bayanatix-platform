import { updateDpiaRisk, deleteDpiaRisk } from "@/lib/privacy/dpia";
import { respond, viewer } from "@/lib/privacy/dpia-http";

type Ctx = { params: { id: string; riskId: string } };

// PATCH { title, description?, inherentLikelihood, inherentSeverity, residualLikelihood?, residualSeverity? }
export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  return respond(await updateDpiaRisk(id, Number(params.riskId), await req.json().catch(() => ({})), v.session));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  return respond(await deleteDpiaRisk(id, Number(params.riskId), v.session));
}
