import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { listUsers, createUser, getUserById, emailTaken, userIdTaken, EMAIL_RE, USERNAME_RE } from "@/lib/queries/admin";

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
  const userId = String(body.userId ?? "").trim().toLowerCase();
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.fullName ?? "").trim();
  const { systemRole, password } = body;
  if (!userId || !email || !fullName || !password)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  // The username is an internal id (people sign in with their email): letters, digits,
  // dot, dash, underscore — it appears in links, so no @ or spaces.
  if (!USERNAME_RE.test(userId))
    return NextResponse.json({ error: "Username: 3–64 characters, lowercase letters, digits, dot, dash or underscore (e.g. john.tiger)" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  if (await userIdTaken(userId)) return NextResponse.json({ error: `The username "${userId}" is already taken` }, { status: 409 });
  if (await emailTaken(email)) return NextResponse.json({ error: "A user with this email address already exists" }, { status: 409 });

  const passwordHash = await hashPassword(password);
  await createUser(userId, email, fullName, systemRole ?? "VIEWER", passwordHash);
  return NextResponse.json({ ok: true, user: await getUserById(userId) }, { status: 201 });
}
