import { updateDpiaMeasure, deleteDpiaMeasure } from "@/lib/privacy/dpia";
import { respond, viewer } from "@/lib/privacy/dpia-http";

type Ctx = { params: { id: string; measureId: string } };

// PATCH { text, riskId?, ownerUserId?, dueDate? } to reword it, or { status, note? } to record progress.
export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  return respond(await updateDpiaMeasure(id, Number(params.measureId), await req.json().catch(() => ({})), v.session));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  return respond(await deleteDpiaMeasure(id, Number(params.measureId), v.session));
}
