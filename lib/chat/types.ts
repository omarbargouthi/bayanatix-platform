import type { SessionUser } from "@/lib/types";

export type SourceRef = {
  assetType: string;
  assetId:   number;
  label:     string;
  href:      string | null;
};

export type ToolExecContext = { session: SessionUser };

export type ToolResult =
  // `action`: something the user can act on below the answer (e.g. an Apply button).
  | { ok: true; data: unknown; sources: SourceRef[]; action?: unknown }
  | { ok: false; error: string };

export type ToolDefinition = {
  name:        string;
  description: string;
  inputSchema: object;
  run: (args: Record<string, unknown>, ctx: ToolExecContext) => Promise<ToolResult>;
};
