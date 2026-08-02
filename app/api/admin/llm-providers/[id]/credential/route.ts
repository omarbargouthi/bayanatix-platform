import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setCredential } from "@/lib/queries/llm-providers";

// Write-only (spec §3): the plaintext key is accepted here and never returned by
// any GET — profiles only ever expose credentialLast4 / credentialRotatedAt.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profileId = Number(params.id);
  if (!Number.isFinite(profileId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const key = String(body.key ?? "");
  if (!key.trim()) return NextResponse.json({ error: "key is required" }, { status: 400 });

  try {
    await setCredential(profileId, key, session.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
