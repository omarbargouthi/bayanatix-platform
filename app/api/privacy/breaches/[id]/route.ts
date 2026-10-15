import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  addBreachNote, breachPermissions, handlesAllBreaches, canViewBreach, changeBreachAsset, closeBlockers, getBreach, moveBreach, refreshBreach, updateBreach,
} from "@/lib/privacy/breach";

type Params = { params: { id: string } };
const STATUS: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403 };
const respond = (res: object) =>
  "error" in res ? NextResponse.json(res, { status: STATUS[(res as unknown as { code: string }).code] ?? 400 }) : NextResponse.json(res);

async function viewer(id: number) {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!Number.isFinite(id) || !(await canViewBreach(session, id))) return { response: NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 }) };
  return { session };
}

// GET — the breach, what the user may do, and what is still missing before it can be closed.
export async function GET(_: Request, { params }: Params) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  const breach = await getBreach(id);
  if (!breach) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ breach, permissions: { ...breachPermissions(v.session!, breach), canAssign: handlesAllBreaches(v.session!.role) }, missing: closeBlockers(breach) });
}

// PATCH { field: value, … } — the editable fields (lib/privacy/breach.ts FIELDS) and ownerUserId.
export async function PATCH(req: Request, { params }: Params) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  return respond(await updateBreach(id, await req.json().catch(() => ({})), v.session!));
}

// POST { action, … }:
//   ADD_ASSET / REMOVE_ASSET { typeCode, assetId } · REFRESH · NOTE { note }
//   INVESTIGATE · CONTAIN · CLOSE { note? } · NOT_A_BREACH { note } · REOPEN { note? }
export async function POST(req: Request, { params }: Params) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  const b = await req.json().catch(() => ({}));
  const s = v.session!;
  switch (b.action) {
    case "ADD_ASSET": case "REMOVE_ASSET":
      return respond(await changeBreachAsset(id, b.action === "ADD_ASSET" ? "ADD" : "REMOVE", String(b.typeCode ?? ""), Number(b.assetId), s));
    case "REFRESH": return respond(await refreshBreach(id, s));
    case "NOTE": return respond(await addBreachNote(id, b.note, s));
    default: return respond(await moveBreach(id, b.action, b.note, s));
  }
}
