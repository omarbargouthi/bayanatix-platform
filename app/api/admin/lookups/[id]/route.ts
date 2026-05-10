import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateLookup, deleteLookup } from "@/lib/queries/app-lookups";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: {
    lookupLabel: string;
    description: string | null;
    sortOrder:   number;
    isActive:    boolean;
  } = await req.json();

  await updateLookup(Number(params.id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await deleteLookup(Number(params.id));

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
