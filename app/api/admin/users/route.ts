import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { listUsers, createUser } from "@/lib/queries/admin";

export async function GET() {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const users = await listUsers();
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { userId, email, fullName, systemRole, password } = body;
  if (!userId || !email || !fullName || !password)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const passwordHash = await hashPassword(password);
  await createUser(userId, email, fullName, systemRole ?? "VIEWER", passwordHash);
  return NextResponse.json({ ok: true }, { status: 201 });
}
