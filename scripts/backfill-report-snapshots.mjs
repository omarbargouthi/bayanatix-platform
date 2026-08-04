// Manually captures a Report KPI snapshot for every report, right now, against a
// running instance of the app (dev or prod). Reuses the same admin-triggered
// /api/reports/{reportCode}/snapshot endpoint a human clicking "Capture Snapshot"
// would hit — no separate snapshot logic to keep in sync.
//
// LIMITATION: KPIs reflect *live current* state. This can capture "this month's"
// value on demand, but it cannot reconstruct what a KPI's value actually was in a
// past month — there's no historical data to recompute from. Use it to backfill the
// current month after a gap, not to fabricate history.
//
// Usage: BASE_URL=http://localhost:3000 ADMIN_EMAIL=sara@bayanatix.demo ADMIN_PASSWORD=... node scripts/backfill-report-snapshots.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars (must be an ADMIN-role account).");
  process.exit(1);
}

const REPORT_CODES = ["R1_MCM", "R2_DQ", "R3_DC", "R4_DSI", "R5_OD", "R6_FOI", "R7_PDP", "R8_DG_SUMMARY", "R9_RETENTION"];

const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
});
if (!loginRes.ok) {
  console.error(`Login failed: ${loginRes.status}`);
  process.exit(1);
}
const cookie = loginRes.headers.get("set-cookie");
if (!cookie) {
  console.error("No session cookie returned from login.");
  process.exit(1);
}

let totalCaptured = 0;
for (const code of REPORT_CODES) {
  const res = await fetch(`${BASE_URL}/api/reports/${code}/snapshot`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  if (!res.ok) {
    console.error(`  ${code}: FAILED (${res.status})`);
    continue;
  }
  const body = await res.json();
  console.log(`  ${code}: captured ${body.captured}`);
  totalCaptured += body.captured ?? 0;
}

console.log(`\nDone. ${totalCaptured} snapshot rows captured across ${REPORT_CODES.length} reports.`);
