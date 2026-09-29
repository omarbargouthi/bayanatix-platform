import { NextResponse } from "next/server";
import { getLogoBlob } from "@/lib/queries/branding";

// Public (see middleware.ts's PUBLIC_PREFIXES) — the login page needs to render
// the logo before a session exists, same reasoning as /api/languages there.
// Every <img> that shows the app logo (Sidebar, login page) points here instead
// of directly at /logo.svg, so uploading a custom one in Admin > Configuration >
// Branding takes effect everywhere without touching any component.
export async function GET(req: Request) {
  const blob = await getLogoBlob();
  if (!blob) return NextResponse.redirect(new URL("/logo.svg", req.url));

  return new NextResponse(blob.data as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": blob.mimeType,
      "Cache-Control": "no-cache", // an admin swapping the logo should see it change immediately, not after a stale cache expires
    },
  });
}
