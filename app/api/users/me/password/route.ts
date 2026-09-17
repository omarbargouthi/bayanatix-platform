import { NextResponse } from "next/server";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { findUserById, updatePasswordHash } from "@/lib/queries/users";

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = (await req.json()) as {
    currentPassword?: string; newPassword?: string;
  };
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Current and new password are required" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const user = await findUserById(session.userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

  await updatePasswordHash(session.userId, await hashPassword(newPassword));
  return NextResponse.json({ ok: true });
}
