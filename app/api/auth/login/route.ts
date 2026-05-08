import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/queries/users";
import { setSessionCookie, signSession, verifyPassword } from "@/lib/auth";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const user = await findUserByEmail(parsed.email);
  const ok = user && (await verifyPassword(parsed.password, user.password_hash));
  if (!user || !ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await signSession({
    userId: user.user_id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
  });
  setSessionCookie(token);

  return NextResponse.json({
    user: { userId: user.user_id, email: user.email, fullName: user.full_name, role: user.role },
  });
}
