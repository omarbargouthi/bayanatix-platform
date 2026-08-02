import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listProfiles, createProfile } from "@/lib/queries/llm-providers";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listProfiles());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body.profileName || !body.providerType || !body.apiFlavor || !body.baseUrl || !body.modelName) {
    return NextResponse.json({ error: "profileName, providerType, apiFlavor, baseUrl, modelName are required" }, { status: 400 });
  }

  const profileId = await createProfile(body, session.userId);
  return NextResponse.json({ profileId }, { status: 201 });
}
