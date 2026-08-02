import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProfileById, updateProfile, deleteProfile } from "@/lib/queries/llm-providers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = Number(params.id);
  if (!Number.isFinite(profileId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const profile = await getProfileById(profileId);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profileId = Number(params.id);
  if (!Number.isFinite(profileId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  try {
    await updateProfile(profileId, body, session.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profileId = Number(params.id);
  if (!Number.isFinite(profileId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await deleteProfile(profileId, session.userId);
  return NextResponse.json({ ok: true });
}
