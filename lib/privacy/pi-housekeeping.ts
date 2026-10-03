// Keeps real personal data out of Bayanis's own stored metadata (Privacy by Design):
//  * profiling min / max / most-frequent values of personal-data columns are
//    cleared (attribute_profile, attribute_profile_results);
//  * data-quality sample values recorded against personal-data columns are
//    replaced with a marker (counts and pass/fail are kept);
//  * data-quality samples are kept for SAMPLE_RETENTION_DAYS only.
// "Personal-data column" = its classification term is flagged PI — the same
// truth source the PII badge and sample-data masking use, including
// classifications inherited through lineage.
// Runs after crawls (profiling), DQ rule runs and propagation runs; idempotent.
import { sql } from "../db";

export const SAMPLE_RETENTION_DAYS = 90;
export const MASKED_SAMPLE = "[masked: personal data]";

const PI_COLUMNS = sql`
  SELECT abt.asset_id FROM bayanat.asset_business_terms abt
  JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
  WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.term_role = 'CLASSIFICATION' AND bg.is_pii_indicator
`;

export async function maskStoredPersonalData(): Promise<{ profiles: number; profileResults: number; dqSamplesMasked: number; dqSamplesPurged: number }> {
  const profiles = await sql`
    UPDATE bayanat.attribute_profile SET min_value = NULL, max_value = NULL, top_values = NULL, values_masked = true
    WHERE attribute_id IN (${PI_COLUMNS})
      AND (min_value IS NOT NULL OR max_value IS NOT NULL OR top_values IS NOT NULL OR NOT values_masked)
  `;
  const profileResults = await sql`
    UPDATE bayanat.attribute_profile_results SET min_value = NULL, max_value = NULL, top_10_frequent_values = NULL, quantile_data = NULL
    WHERE attribute_id IN (${PI_COLUMNS})
      AND (min_value IS NOT NULL OR max_value IS NOT NULL OR top_10_frequent_values IS NOT NULL OR quantile_data IS NOT NULL)
  `;
  const dqSamplesMasked = await sql`
    UPDATE bayanat.dq_run_samples s SET sample_value = ${MASKED_SAMPLE}
    FROM bayanat.dq_results r JOIN bayanat.dq_rules dr ON dr.rule_id = r.rule_id
    WHERE s.result_id = r.result_id AND s.sample_value IS DISTINCT FROM ${MASKED_SAMPLE}
      AND dr.asset_type_code = 'DATA_ATTRIBUTES' AND dr.asset_id IN (${PI_COLUMNS})
  `;
  const dqSamplesPurged = await sql`
    DELETE FROM bayanat.dq_run_samples WHERE created_at < now() - make_interval(days => ${SAMPLE_RETENTION_DAYS})
  `;
  return { profiles: profiles.count, profileResults: profileResults.count, dqSamplesMasked: dqSamplesMasked.count, dqSamplesPurged: dqSamplesPurged.count };
}

/** Fire-and-forget wrapper for hooks that must never fail their caller. */
export function maskStoredPersonalDataQuietly(context: string): void {
  void maskStoredPersonalData()
    .then((r) => { if (r.profiles + r.profileResults + r.dqSamplesMasked + r.dqSamplesPurged > 0) console.log(`[pi-housekeeping:${context}]`, r); })
    .catch((e) => console.error(`[pi-housekeeping:${context}] failed`, e));
}

// ── Data access log ────────────────────────────────────────────────────────
export async function logDataAccess(entry: {
  userId: string; assetType: string; assetId: number; piColumnCount: number; clearText: boolean;
  clearTextBasis: "GRANT" | "ADMIN" | null; rowCount: number | null; ip?: string | null; userAgent?: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO bayanat.data_access_log
      (user_id, access_type_code, asset_type_code, asset_id, pi_column_count, clear_text, clear_text_basis, row_count, ip_address_text, user_agent_text)
    VALUES (${entry.userId}, 'SAMPLE_VIEW', ${entry.assetType}, ${entry.assetId}, ${entry.piColumnCount}, ${entry.clearText},
            ${entry.clearTextBasis}, ${entry.rowCount}, ${entry.ip?.slice(0, 45) ?? null}, ${entry.userAgent ?? null})
  `;
}
