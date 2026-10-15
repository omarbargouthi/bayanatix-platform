import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { canAccessDomain } from "@/lib/can";
import { getCustomAssetTypes } from "@/lib/queries/custom-assets";
import { breachUserOptions, createBreach, defaultBreachRegulations, handlesAllBreaches, listBreaches } from "@/lib/privacy/breach";

// Personal data breaches. Data protection officers and admins see the whole register;
// anyone else sees the breaches they reported or were assigned to handle.

// GET — the register. ?options=1 → handlers, asset types and the default laws for the report form.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (new URL(req.url).searchParams.get("options")) {
    const all = handlesAllBreaches(session.role);
    const [users, types, regulations] = await Promise.all([all ? breachUserOptions() : [], getCustomAssetTypes(), defaultBreachRegulations()]);
    const customTypes = types.map((x) => ({ typeCode: x.typeCode, name: x.typeNameText, nameTranslations: x.nameTranslations }));
    return NextResponse.json({ users, customTypes, canAssign: all, regulations });
  }
  return NextResponse.json({ items: await listBreaches(session), handlesAll: handlesAllBreaches(session.role) });
}

// POST { title, description?, discoveredAt?, ownerUserId?, assets?: [{ typeCode, id }], regulations? } — anyone may report,
// here or from New Request.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await createBreach(await req.json().catch(() => ({})), session);
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  // For the New Request confirmation: the reference, and whether the reporter can open
  // the breach page (it sits under Data Privacy).
  const [row] = await sql<{ reference: string }[]>`SELECT reference_code AS reference FROM bayanat.privacy_breaches WHERE breach_id = ${res.breachId}`;
  return NextResponse.json({ ...res, reference: row?.reference ?? null, canOpen: await canAccessDomain(session, "DATA_PRIVACY") }, { status: 201 });
}
