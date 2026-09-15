import { sql } from "./db";

export type SampleDataSettings = { sampleRecordCount: number };

export async function getSampleDataSettings(): Promise<SampleDataSettings> {
  const [row] = await sql<SampleDataSettings[]>`
    SELECT sample_record_count AS "sampleRecordCount" FROM bayanat.sample_data_settings WHERE settings_id = 1
  `;
  return row ?? { sampleRecordCount: 20 };
}

export async function updateSampleDataSettings(data: { sampleRecordCount?: number }): Promise<void> {
  await sql`
    UPDATE bayanat.sample_data_settings
    SET sample_record_count = COALESCE(${data.sampleRecordCount ?? null}, sample_record_count)
    WHERE settings_id = 1
  `;
}
