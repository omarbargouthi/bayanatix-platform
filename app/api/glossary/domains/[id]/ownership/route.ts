import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  handleOwnershipGET,
  handleOwnershipPATCH,
  handleOwnershipPOST,
  handleOwnershipDELETE,
} from "@/lib/queries/glossary-ownership";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return handleOwnershipGET(Number(params.id));
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return handleOwnershipPATCH(req, Number(params.id), session.role);
}

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return handleOwnershipPOST(req, Number(params.id), session.userId, session.role);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return handleOwnershipDELETE(req, Number(params.id), session.role);
}
