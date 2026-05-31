import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listDomainConfig, upsertDomainConfig, deleteDomainConfig } from "@/lib/queries/gov-compliance";

export async function GET(
  _req: Request,
  { params }: { params: { frameworkId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const fwId = Number(params.frameworkId);
  const configs = await listDomainConfig(fwId);
  return NextResponse.json({ configs });
}

export async function POST(
  req: Request,
  { params }: { params: { frameworkId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const fwId = Number(params.frameworkId);
  const body = await req.json();
  const id = await upsertDomainConfig(fwId, {
    domainCode:    body.domainCode,
    nameEn:        body.nameEn,
    nameAr:        body.nameAr        ?? null,
    descriptionEn: body.descriptionEn ?? null,
    descriptionAr: body.descriptionAr ?? null,
    sortOrder:     body.sortOrder      ?? 0,
    weight:        body.weight != null ? Number(body.weight) : null,
  });
  return NextResponse.json({ id });
}

export async function DELETE(
  req: Request,
  _ctx: { params: { frameworkId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  await deleteDomainConfig(Number(body.configId));
  return NextResponse.json({ ok: true });
}
