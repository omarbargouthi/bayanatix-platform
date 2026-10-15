import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSecretsStatus, resealAll, logReseal, rotateKey, testProvider } from "@/lib/secrets-rotation";

// Encryption key status, re-encryption, Vault key rotation and a connection test.
//  * An administrator (Configuration › Encryption Keys).
//  * scripts/reseal-secrets.mjs (Authorization: Bearer CRON_SECRET, no session), for a
//    rotation or a move to Vault done from the server; it acts as SYSTEM.
// Never returns a secret or a key; key ids are a short hash or a Vault key version.
async function actor(req: Request): Promise<string | null> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return "SYSTEM";
  const session = await getSession();
  return session?.role === "ADMIN" ? session.userId : null;
}

const failure = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });

export async function GET(req: Request) {
  if (!(await actor(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { return NextResponse.json(await getSecretsStatus()); } catch (e) { return failure(e); }
}

// POST { action?: "reseal" (default) | "rotate" | "test" }
export async function POST(req: Request) {
  const userId = await actor(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { action = "reseal" } = await req.json().catch(() => ({}));
  try {
    if (action === "test") return NextResponse.json({ test: await testProvider() });
    if (action === "rotate") {
      const keyId = await rotateKey(userId);
      return NextResponse.json({ rotated: keyId, status: await getSecretsStatus() });
    }
    const result = await resealAll(userId);
    await logReseal(userId, result);
    return NextResponse.json({ result, status: await getSecretsStatus() });
  } catch (e) { return failure(e); }
}
