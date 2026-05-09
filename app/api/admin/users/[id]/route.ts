import { NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { updateUser, updateUserPassword } from "@/lib/queries/admin";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { fullName, email, systemRole, isActive, password } = body;

  await updateUser(params.id, { fullName, email, systemRole, isActive });
  if (password) {
    const hash = await hashPassword(password);
    await updateUserPassword(params.id, hash);
  }
  return NextResponse.json({ ok: true });
}
