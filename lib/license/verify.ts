import { jwtVerify, importSPKI } from "jose";
import { LICENSE_PUBLIC_KEY_PEM } from "./public-key";
import type { LicenseStatus } from "./types";

const ISSUER = "bayanatix-license";
const ALG = "ES256";

// How long the app keeps working past expiry before hard-blocking -- covers a
// renewal running a few days late without an instant mid-business lockout.
const GRACE_PERIOD_DAYS = 14;

// licenseExpiresAt is a custom claim, not the standard JWT `exp` -- using `exp`
// would make jose's own expiration check reject the token outright once past
// due, leaving no way to tell "expired but in grace" apart from "invalid".
let cachedKey: Promise<CryptoKey> | null = null;
function publicKey(): Promise<CryptoKey> {
  if (!cachedKey) cachedKey = importSPKI(LICENSE_PUBLIC_KEY_PEM, ALG) as Promise<CryptoKey>;
  return cachedKey;
}

export async function verifyLicense(token: string | undefined): Promise<LicenseStatus> {
  if (!token) return { state: "missing" };

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, await publicKey(), { issuer: ISSUER }));
  } catch {
    return { state: "invalid" };
  }

  const customerName = String(payload.customerName ?? payload.customerId ?? "unknown");
  const expiresAtMs = Date.parse(String(payload.licenseExpiresAt ?? ""));
  if (!Number.isFinite(expiresAtMs)) return { state: "invalid" };

  const expiresAt = new Date(expiresAtMs).toISOString();
  const daysPastExpiry = Math.floor((Date.now() - expiresAtMs) / 86_400_000);

  if (daysPastExpiry <= 0) return { state: "active", customerName, expiresAt, daysRemaining: -daysPastExpiry };
  if (daysPastExpiry <= GRACE_PERIOD_DAYS) {
    return { state: "grace", customerName, expiresAt, daysRemaining: GRACE_PERIOD_DAYS - daysPastExpiry };
  }
  return { state: "expired", customerName, expiresAt, daysExpired: daysPastExpiry };
}

export function isLicenseBlocked(status: LicenseStatus): boolean {
  return status.state === "missing" || status.state === "invalid" || status.state === "expired";
}
