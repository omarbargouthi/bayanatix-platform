import { NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { updateUser, updateUserPassword, getUserById, emailTaken, EMAIL_RE } from "@/lib/queries/admin";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let userId = params.id;
  try { userId = decodeURIComponent(params.id); } catch { /* keep as-is */ }
  const existing = await getUserById(userId);
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await req.json();
  const { fullName, systemRole, isActive, password } = body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
  if (email !== undefined) {
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    if (await emailTaken(email, userId)) return NextResponse.json({ error: "Another user already has this email address" }, { status: 409 });
  }
  // An admin can't lock themselves out by deactivating their own account.
  if (isActive === false && userId === user.userId) return NextResponse.json({ error: "You can't deactivate your own account" }, { status: 400 });

  await updateUser(userId, { fullName, email, systemRole, isActive });
  if (password) {
    const hash = await hashPassword(password);
    await updateUserPassword(userId, hash);
  }
  return NextResponse.json({ ok: true });
}
