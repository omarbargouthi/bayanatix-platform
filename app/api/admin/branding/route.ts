import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBrandingInfo, setLogo, clearLogo } from "@/lib/queries/branding";

const ALLOWED_MIME = new Set(["image/svg+xml", "image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024; // 2MB — a logo has no business being larger than this

// This is an ADDITIONAL customer logo shown alongside the Bayanatix logo, not a
// replacement for it. GET is open to any signed-in user — same reasoning as
// /api/admin/follow-settings: every page deciding whether to render the customer
// logo (via /api/branding/logo) needs hasCustomLogo, not just admins.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getBrandingInfo());
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });

  const file = form.get("logo");
  if (!(file instanceof File)) return NextResponse.json({ error: "logo file is required" }, { status: 400 });
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Logo must be SVG, PNG, JPEG, or WebP" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Logo must be 2MB or smaller" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  await setLogo(buf, file.type, file.name);
  return NextResponse.json(await getBrandingInfo());
}

export async function DELETE() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await clearLogo();
  return NextResponse.json(await getBrandingInfo());
}
