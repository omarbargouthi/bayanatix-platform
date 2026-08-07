export const TOOL_PROGRESS_LABELS: Record<string, string> = {
  search_assets: "Searching the catalog…",
  get_asset: "Looking up asset details…",
  get_asset_children: "Listing related assets…",
  get_classification_summary: "Checking classification coverage…",
  get_dq_status: "Checking data quality results…",
  get_definitions: "Looking up the glossary…",
  get_open_data: "Checking published open data…",
  get_sharing_agreements: "Checking sharing agreements…",
  get_foi_stats: "Checking FOI statistics…",
  get_foi_request: "Looking up the FOI request…",
};

export function progressLabelForTool(name: string): string {
  return TOOL_PROGRESS_LABELS[name] ?? `Running ${name}…`;
}
