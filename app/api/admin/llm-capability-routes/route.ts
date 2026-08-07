import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listCapabilityRoutes, upsertCapabilityRoute, type Capability } from "@/lib/queries/llm-providers";

const VALID_CAPABILITIES: Capability[] = ["DESCRIBE", "REPHRASE", "DQ_SEMANTIC", "CHAT"];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listCapabilityRoutes());
}

// Body: { capabilityCode, profileId: number|null, fallbackProfileId: number|null }
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!VALID_CAPABILITIES.includes(body.capabilityCode)) {
    return NextResponse.json({ error: `capabilityCode must be one of ${VALID_CAPABILITIES.join(", ")}` }, { status: 400 });
  }

  await upsertCapabilityRoute(
    body.capabilityCode,
    body.profileId != null ? Number(body.profileId) : null,
    body.fallbackProfileId != null ? Number(body.fallbackProfileId) : null,
    session.userId,
  );
  return NextResponse.json({ ok: true });
}
