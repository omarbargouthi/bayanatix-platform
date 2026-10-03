import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { verifyLicense, isLicenseBlocked } from "@/lib/license/verify";

const PUBLIC_PREFIXES = [
  "/license-expired",   // must stay reachable even when the license check below blocks everything else
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/config",       // login page needs this before a session exists, to know which provider UI to render
  "/api/auth/oidc",         // OIDC start/callback redirects happen before a session exists by definition
  "/_next",
  "/favicon",
  "/logo.svg",
  "/foi-request",           // public FOI intake form + tracking
  "/api/foi/intake",        // public intake submission
  "/api/foi/track",         // public tracking lookup + quote accept/decline (own token-based auth, not session-based —
                            // was missing here entirely, so every anonymous citizen hitting the tracking page got
                            // silently redirected to /login before ever reaching the route's own "no auth" handler
  "/api/reports/cron/snapshot", // Vercel Cron — no session cookie, authenticates via its own CRON_SECRET bearer check
  "/api/lineage/pbix/scheduled-scan", // scripts/pbix-scheduler.mjs — no session cookie, same CRON_SECRET bearer check
  "/api/admin/sources/scheduled-crawl", // scripts/scheduler.mjs — no session cookie, same CRON_SECRET bearer check
  "/api/dq/scheduled-run",              // scripts/scheduler.mjs — no session cookie, same CRON_SECRET bearer check
  "/api/admin/scheduled-jobs/run",      // scripts/scheduler.mjs — no session cookie, same CRON_SECRET bearer check
  "/api/admin/retention/run",           // scripts/scheduler.mjs (CRON_SECRET bearer) — also accepts an admin session itself
                                         // (NOT /api/admin/scheduled-jobs itself — that one stays session-protected)
  "/api/languages",         // login page's language picker needs this before a session exists
  "/api/translations/bundle", // same reason — non-sensitive UI copy, needed pre-auth by login + public FOI pages
  "/api/branding/logo",     // login page's logo needs this before a session exists, same reason as /api/languages
];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname === "/logo.svg");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname !== "/license-expired") {
    const licenseStatus = await verifyLicense(process.env.LICENSE_KEY);
    if (isLicenseBlocked(licenseStatus)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: `LICENSE_${licenseStatus.state.toUpperCase()}` }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/license-expired";
      return NextResponse.redirect(url);
    }
  }

  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get("bayanatix_session")?.value;
  let valid = false;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET), { issuer: "bayanatix" });
      valid = true;
    } catch {
      valid = false;
    }
  }

  if (!valid) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
