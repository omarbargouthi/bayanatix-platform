export type LicenseStatus =
  | { state: "missing" }
  | { state: "invalid" }
  | { state: "expired"; customerName: string; expiresAt: string; daysExpired: number }
  | { state: "grace"; customerName: string; expiresAt: string; daysRemaining: number }
  | { state: "active"; customerName: string; expiresAt: string; daysRemaining: number };
