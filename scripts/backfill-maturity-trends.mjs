// Seeds bayanat.maturity_trends with a demo trend history for the dashboard's
// maturity chart. The CURRENT month is always the real, live-computed weighted
// overall maturity score (see computeCurrentScore() below — mirrors the
// weighted_maturity CTE in lib/queries/domains.ts). There is no real historical
// data to reconstruct the months before it, so — per explicit product direction —
// this SIMULATES a plausible gradual ramp for the preceding MONTHS_BACK months,
// ending just below today's real score. Re-running it only fills gaps; it never
// overwrites a month that's already been captured (ON CONFLICT DO NOTHING).
//
// Usage: node scripts/backfill-maturity-trends.mjs [monthsBack]
import postgres from "postgres";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env.local");
try {
  const envFile = readFileSync(envPath, "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/bayanatix");

const MONTHS_BACK = parseInt(process.argv[2] ?? "5", 10);

async function computeCurrentScore() {
  const rows = await sql`
    WITH maturity_raw AS (
      SELECT DISTINCT
             split_part(r.standard_code, '.', 1) AS ndi_domain_code,
             r.standard_code,
             COALESCE(s.selected_level, 0)       AS selected_level
      FROM   bayanat.gov_compliance_requirements r
      LEFT   JOIN bayanat.compliance_maturity_selections s
        ON   s.framework_id  = r.framework_id
        AND  s.standard_code = r.standard_code
      WHERE  r.compliance_or_maturity = 'نضج'
        AND  r.framework_id = 1
    ),
    domain_avg AS (
      SELECT ndi_domain_code, AVG(selected_level) AS avg_level
      FROM   maturity_raw
      GROUP  BY ndi_domain_code
    ),
    weighted AS (
      SELECT SUM(da.avg_level * cfg.weight) AS weighted_sum, SUM(cfg.weight) AS weight_sum
      FROM   domain_avg da
      JOIN   bayanat.gov_compliance_domain_config cfg
        ON   cfg.domain_code = da.ndi_domain_code AND cfg.framework_id = 1
    )
    SELECT ROUND(weighted_sum / NULLIF(weight_sum, 0), 2)::float8 AS score FROM weighted
  `;
  return rows[0]?.score ?? 0;
}

const currentScore = await computeCurrentScore();
const now = new Date();

// Simulated ramp: start ~30% below today's score (floored at 0.5), rising
// smoothly to ~92% of it by last month, with the current month getting the
// real live number.
const points = [];
const startScore = Math.max(0.5, currentScore * 0.7);
for (let i = MONTHS_BACK; i >= 1; i--) {
  const t = 1 - i / MONTHS_BACK; // 0 → 1 as we approach the current month
  const score = Math.round((startScore + (currentScore * 0.92 - startScore) * t) * 100) / 100;
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
  points.push({ year: d.getFullYear(), month: d.getMonth() + 1, score });
}
points.push({ year: now.getFullYear(), month: now.getMonth() + 1, score: currentScore, isReal: true });

let inserted = 0;
for (const p of points) {
  const result = await sql`
    INSERT INTO bayanat.maturity_trends (trend_year, trend_month, maturity_score, notes)
    VALUES (${p.year}, ${p.month}, ${p.score}, ${p.isReal ? "live computed" : "simulated demo history"})
    ON CONFLICT (trend_year, trend_month) DO NOTHING
    RETURNING trend_id
  `;
  if (result.length > 0) inserted++;
  console.log(`  ${p.year}-${String(p.month).padStart(2, "0")}: ${p.score} ${p.isReal ? "(real)" : "(simulated)"}${result.length === 0 ? " — already present, skipped" : ""}`);
}

console.log(`\nDone. Inserted ${inserted} of ${points.length} months. Current live score: ${currentScore}.`);
await sql.end();
