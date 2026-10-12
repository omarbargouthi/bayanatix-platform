// Maturity by domain, for every regulation assessed in maturity mode (NDI, NAII, …) —
// the Governance page's counterpart of the Dashboard's domain cards, which cover NDI only.
import { sql } from "../db";
import { computeFrameworkMaturityScore } from "./gov-compliance";

export type MaturityLevelBand = { levelNum: number; name: string; nameAr: string | null; colorHex: string };

export type DomainMaturity = {
  domainCode: string;
  nameEn:     string;
  nameAr:     string | null;
  /** Average selected level across the domain's standards, 0–5. */
  score:      number;
  /** How many of the domain's standards have a level selected. */
  assessedStandards: number;
  totalStandards:    number;
  weight:     number | null;
  level:      MaturityLevelBand;
};

export type FrameworkMaturity = {
  frameworkId: number;
  code:        string;
  name:        string;
  /** Weighted by the domains' configured weights, or their plain average when none are set. */
  score:       number;
  level:       MaturityLevelBand;
  domains:     DomainMaturity[];
};

// The bands used when a regulation's levels have no ranges configured (NDI's own bands).
const DEFAULT_BANDS: [number, number][] = [[0, 0.24], [0.25, 1.24], [1.25, 2.49], [2.5, 3.99], [4, 4.74], [4.75, 5]];
const FALLBACK_LEVELS: MaturityLevelBand[] = [
  { levelNum: 0, name: "No Capability", nameAr: null, colorHex: "#D84848" },
  { levelNum: 1, name: "Build",         nameAr: null, colorHex: "#E88030" },
  { levelNum: 2, name: "Definition",    nameAr: null, colorHex: "#2D4AA0" },
  { levelNum: 3, name: "Activation",    nameAr: null, colorHex: "#3D7EC8" },
  { levelNum: 4, name: "Managed",       nameAr: null, colorHex: "#1E8C76" },
  { levelNum: 5, name: "Innovation",    nameAr: null, colorHex: "#5CA85C" },
];

type LevelRow = MaturityLevelBand & { rangeFrom: number | null; rangeTo: number | null };

function bandFor(score: number, levels: LevelRow[]): MaturityLevelBand {
  const strip = (l: LevelRow): MaturityLevelBand => ({ levelNum: l.levelNum, name: l.name, nameAr: l.nameAr, colorHex: l.colorHex });
  const ranged = levels.filter((l) => l.rangeFrom != null && l.rangeTo != null);
  if (ranged.length > 0) {
    // Scores are rounded to 2 decimals, the same precision the ranges are written in.
    const hit = ranged.find((l) => score >= l.rangeFrom! && score <= l.rangeTo!);
    if (hit) return strip(hit);
  }
  const num = Math.max(0, DEFAULT_BANDS.findIndex(([from, to]) => score >= from && score <= to));
  const named = levels.find((l) => l.levelNum === num);
  return named ? strip(named) : FALLBACK_LEVELS[num];
}

export async function getMaturityByDomain(): Promise<FrameworkMaturity[]> {
  const frameworks = await sql<{ frameworkId: number; code: string; name: string }[]>`
    SELECT framework_id AS "frameworkId", code, name
    FROM bayanat.gov_compliance_frameworks
    WHERE assessment_mode = 'MATURITY' AND is_applicable_indicator
    ORDER BY framework_id
  `;

  return Promise.all(frameworks.map(async (f) => {
    const [levels, rows, score] = await Promise.all([
      sql<LevelRow[]>`
        SELECT level_num AS "levelNum", name, name_ar AS "nameAr", color_hex AS "colorHex",
               range_from::float8 AS "rangeFrom", range_to::float8 AS "rangeTo"
        FROM bayanat.gov_compliance_level_config WHERE framework_id = ${f.frameworkId} ORDER BY level_num
      `,
      // A requirement belongs to the domain whose code is either the prefix of its standard
      // code (NDI: "DG.MQ.1" → "DG") or its own domain code (NAII: "Direction") — the same
      // rule as computeFrameworkMaturityScore. Every standard counts once.
      sql<{ domainCode: string; nameEn: string; nameAr: string | null; weight: number | null; score: number; assessed: number; total: number }[]>`
        WITH standards AS (
          SELECT DISTINCT r.standard_code, split_part(r.standard_code, '.', 1) AS key_a, r.domain_code AS key_b,
                 s.selected_level
          FROM   bayanat.gov_compliance_requirements r
          LEFT   JOIN bayanat.compliance_maturity_selections s
            ON   s.framework_id = r.framework_id AND s.standard_code = r.standard_code
          WHERE  r.compliance_or_maturity = 'نضج' AND r.framework_id = ${f.frameworkId}
        )
        SELECT cfg.domain_code AS "domainCode", cfg.name_en AS "nameEn", cfg.name_ar AS "nameAr",
               cfg.weight::float8 AS weight,
               COALESCE(ROUND(AVG(COALESCE(st.selected_level, 0)), 2), 0)::float8 AS score,
               COUNT(st.selected_level)::int AS assessed,
               COUNT(st.standard_code)::int  AS total
        FROM   bayanat.gov_compliance_domain_config cfg
        LEFT   JOIN standards st ON cfg.domain_code IN (st.key_a, st.key_b)
        WHERE  cfg.framework_id = ${f.frameworkId}
        GROUP  BY cfg.config_id
        ORDER  BY cfg.sort_order, cfg.name_en
      `,
      computeFrameworkMaturityScore(f.frameworkId),
    ]);

    return {
      ...f, score, level: bandFor(score, levels),
      domains: rows.filter((r) => r.total > 0).map((r) => ({
        domainCode: r.domainCode, nameEn: r.nameEn || r.domainCode, nameAr: r.nameAr, weight: r.weight,
        score: r.score, assessedStandards: r.assessed, totalStandards: r.total, level: bandFor(r.score, levels),
      })),
    };
  }));
}
