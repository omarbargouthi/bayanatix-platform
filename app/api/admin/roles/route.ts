import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listRoles, createRole } from "@/lib/queries/admin";

export async function GET() {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listRoles());
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.roleName) return NextResponse.json({ error: "roleName required" }, { status: 400 });

  const roleId = await createRole({
    roleName:       body.roleName,
    description:    body.description    ?? "",
    metadataRead:   body.metadataRead   ?? false,
    metadataWrite:  body.metadataWrite  ?? false,
    metadataDelete: body.metadataDelete ?? false,
    dataRead:       body.dataRead       ?? false,
    isAdmin:        body.isAdmin        ?? false,
  });
  return NextResponse.json({ roleId }, { status: 201 });
}
