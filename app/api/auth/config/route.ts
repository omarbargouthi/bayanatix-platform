import { NextResponse } from "next/server";
import { getPublicAuthConfig } from "@/lib/queries/auth-settings";

// Unauthenticated by design — the login page needs this before anyone is signed
// in, to decide whether to render a password form or an SSO button. Deliberately
// returns nothing beyond the provider type: no URLs, ids, or config details.
export async function GET() {
  const config = await getPublicAuthConfig();
  return NextResponse.json(config);
}
