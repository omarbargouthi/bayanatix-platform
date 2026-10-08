import { NextResponse } from "next/server";
import { getLogoBlob } from "@/lib/queries/branding";

// Reads the database on every request — never pre-computed at build time.
export const dynamic = "force-dynamic";

// Public (see middleware.ts's PUBLIC_PREFIXES) — the login page needs to render
// this before a session exists, same reasoning as /api/languages there.
// This is an ADDITIONAL customer logo shown alongside the Bayanatix logo, not a
// replacement for it — /logo.svg (Bayanatix) stays hardcoded in every component;
// components only render an <img> pointing here after checking hasCustomLogo via
// GET /api/admin/branding, so a 404 here (no customer logo set) is expected and
// never actually reaches the page.
export async function GET() {
  const blob = await getLogoBlob();
  if (!blob) return NextResponse.json({ error: "No customer logo set" }, { status: 404 });

  return new NextResponse(blob.data as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": blob.mimeType,
      "Cache-Control": "no-cache", // an admin swapping the logo should see it change immediately, not after a stale cache expires
    },
  });
}
