import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateCustomAttributeDefinition, deleteCustomAttributeDefinition } from "@/lib/queries/custom-attributes";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { attrName, enumValues, isRequired, isEnabled, displayOrder } = await req.json();
  await updateCustomAttributeDefinition(Number(params.id), { attrName, enumValues, isRequired, isEnabled, displayOrder });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await deleteCustomAttributeDefinition(Number(params.id));
  return NextResponse.json({ ok: true });
}
