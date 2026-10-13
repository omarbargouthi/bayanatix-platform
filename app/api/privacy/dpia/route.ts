import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCustomAssetTypes } from "@/lib/queries/custom-assets";
import { listDpias, listDpiasForAsset, listDpiaTemplates, dpiaUserOptions, createDpia, canCreateDpia } from "@/lib/privacy/dpia";

// Impact assessments. Admins, data protection officers and stewards see the whole
// register; anyone else sees the assessments they own, started or hold a measure in.

// GET — the register. ?options=1 → questionnaires and people for the forms.
// ?assetType=&assetId= → the assessments one asset is part of.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  if (p.get("options")) {
    const [templates, users, types] = await Promise.all([listDpiaTemplates(), dpiaUserOptions(), getCustomAssetTypes()]);
    const lang = session.preferredLanguageCode ?? "en";
    const customTypes = types.map((x) => ({ typeCode: x.typeCode, name: (lang !== "en" && x.nameTranslations?.[lang]) || x.typeNameText }));
    return NextResponse.json({ templates, users, customTypes, canCreate: canCreateDpia(session.role) });
  }
  const assetType = p.get("assetType"), assetId = Number(p.get("assetId"));
  if (assetType && Number.isFinite(assetId)) return NextResponse.json(await listDpiasForAsset(session, assetType, assetId));
  return NextResponse.json({ items: await listDpias(session), canCreate: canCreateDpia(session.role) });
}

// POST { title, description?, templateId, ownerUserId?, subjectType?, subjectId? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreateDpia(session.role)) return NextResponse.json({ error: "Forbidden — admin, data protection officer or steward only", code: "FORBIDDEN" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const res = await createDpia(b, session);
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res, { status: 201 });
}
