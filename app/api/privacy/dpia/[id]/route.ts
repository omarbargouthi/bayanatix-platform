import { NextResponse } from "next/server";
import {
  getDpia, getDpiaVersion, dpiaPermissions, updateDpia, deleteDpia, changeDpiaAsset, refreshDpia, saveDpiaAnswers,
  decideScreening, submitDpia, returnDpia, decideDpia, reopenDpia,
} from "@/lib/privacy/dpia";
import { acknowledgeDpiaChanges } from "@/lib/privacy/dpia-watch";
import { respond, viewer } from "@/lib/privacy/dpia-http";

type Ctx = { params: { id: string } };

// GET — the assessment with what the signed-in user may do. ?version=n → that frozen version.
export async function GET(req: Request, { params }: Ctx) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  const d = await getDpia(id);
  if (!d) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  const version = Number(new URL(req.url).searchParams.get("version"));
  if (version) {
    const frozen = await getDpiaVersion(id, version);
    if (!frozen) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ dpia: { ...frozen, versions: d.versions, events: [] }, frozenVersion: version, permissions: null });
  }
  return NextResponse.json({ dpia: d, frozenVersion: null, permissions: dpiaPermissions(v.session, d) });
}

// PATCH { action, ... } — UPDATE | ADD_ASSET | REMOVE_ASSET | SET_SUBJECT | REFRESH | ANSWERS | SCREEN | SUBMIT | RETURN | DECIDE | REOPEN | ACK_CHANGES
export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  const s = v.session;
  const b = await req.json().catch(() => ({}));
  switch (b.action) {
    case "UPDATE": return respond(await updateDpia(id, { title: b.title, description: b.description, ownerUserId: b.ownerUserId }, s));
    case "ADD_ASSET": return respond(await changeDpiaAsset(id, "ADD", String(b.assetType), Number(b.assetId), s));
    case "REMOVE_ASSET": return respond(await changeDpiaAsset(id, "REMOVE", String(b.assetType), Number(b.assetId), s));
    case "SET_SUBJECT": return respond(await changeDpiaAsset(id, "SUBJECT", String(b.assetType), Number(b.assetId), s));
    case "REFRESH": return respond(await refreshDpia(id, s));
    case "ANSWERS": return respond(await saveDpiaAnswers(id, b.answers, s));
    case "SCREEN": return respond(await decideScreening(id, { outcome: b.outcome, note: b.note }, s));
    case "SUBMIT": return respond(await submitDpia(id, s));
    case "RETURN": return respond(await returnDpia(id, b.note, s));
    case "DECIDE": return respond(await decideDpia(id, b, s));
    case "REOPEN": return respond(await reopenDpia(id, b.note, s));
    case "ACK_CHANGES": return respond(await acknowledgeDpiaChanges(id, b.note, s));
    default: return NextResponse.json({ error: "Unknown action", code: "UNKNOWN_ACTION" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  return respond(await deleteDpia(id, v.session));
}
