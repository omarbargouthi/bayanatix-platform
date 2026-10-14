// A table's data quality score, computed the same way as getTableDqDimensions()
// (lib/queries/dq.ts) so the Schema tab and the Data Quality tab show the same number:
// each dimension is the average latest score of its active rules (runs that ended in an
// error don't count), and the overall score is the average of the dimensions that have one.

type ScoredRule = { isActive: boolean; dimensionCode: string | null; lastStatusCode: string | null };

export function tableDqScore<R extends ScoredRule>(
  rules: R[], pickScore: (r: R) => number | null,
): { overall: number | null; byDimension: Map<string, number> } {
  const sums = new Map<string, { total: number; n: number }>();
  for (const r of rules) {
    const score = pickScore(r);
    if (!r.isActive || !r.dimensionCode || score == null || r.lastStatusCode === "ERROR") continue;
    const s = sums.get(r.dimensionCode) ?? { total: 0, n: 0 };
    s.total += Number(score);
    s.n += 1;
    sums.set(r.dimensionCode, s);
  }
  const byDimension = new Map([...sums].map(([code, s]) => [code, s.total / s.n]));
  const values = [...byDimension.values()];
  const overall = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return { overall, byDimension };
}
