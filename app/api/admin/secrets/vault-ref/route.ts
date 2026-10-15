import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { vaultConfigured, vaultAllowedPaths, checkVaultRef } from "@/lib/secrets-vault";

// For the password fields' "Vault reference" option (admin only; this path is outside
// the middleware's session check because /api/admin/secrets is, so it checks itself).
// GET  — is Vault configured, and which paths may a reference point to.
// POST { ref: "<path>#<field>" } — does it resolve. Never returns the value.
async function admin() {
  const session = await getSession();
  return session?.role === "ADMIN";
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ available: vaultConfigured(), allowedPaths: vaultAllowedPaths() });
}

export async function POST(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { ref } = await req.json().catch(() => ({}));
  if (typeof ref !== "string" || !ref.trim()) return NextResponse.json({ ok: false, message: "Enter a reference" });
  return NextResponse.json(await checkVaultRef(ref));
}
