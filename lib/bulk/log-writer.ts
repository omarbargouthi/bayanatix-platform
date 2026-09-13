// Bulk Download/Upload — plain-text operation log. One per job, downloadable
// alongside the exported/result workbook once the job finishes (or failed).

import type { BulkJob } from "../queries/bulk-jobs";

export function buildJobLogText(job: BulkJob): Buffer {
  const lines: string[] = [
    `Bulk ${job.jobTypeCode} Job #${job.jobId}`,
    `Status:   ${job.status}`,
    `Created:  ${job.createdAt}`,
    `Finished: ${job.finishedAt ?? "-"}`,
  ];
  if (job.fileName) lines.push(`File:     ${job.fileName}`);
  if (job.scope) lines.push(`Scope:    ${JSON.stringify(job.scope)}`);

  lines.push("", "Totals:");
  const totals = (job.totals ?? {}) as Record<string, unknown>;
  if (Object.keys(totals).length === 0) {
    lines.push("  (none recorded)");
  } else {
    for (const [k, v] of Object.entries(totals)) {
      lines.push(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
  }

  if (job.errorText) lines.push("", `Error: ${job.errorText}`);

  return Buffer.from(lines.join("\n") + "\n", "utf-8");
}
